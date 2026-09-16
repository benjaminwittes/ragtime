/**
 * The shared harness every driver in this directory runs on.
 *
 * **Only `POST …/explorer/turn` is intercepted**, and it is intercepted *in the page* by
 * overriding `window.fetch`. Everything below that stays real: the client's own SSE
 * parser, `useExplorer`, `persist`, `conversations`, `attention` and every component run
 * untouched, and the corpus registry is fetched from the live worker, so the chips are the
 * real ones. What is faked is the model's answer, which is the only part that costs money.
 *
 * So: **nothing here spends and nothing here needs a credential.** The demo password set
 * below is a string the stubbed turn never checks — it is there only so `useAuth()`
 * resolves *something* and the composer opens.
 *
 * A driver is a script, not a test framework: it drives the page, prints what it found,
 * and exits non-zero if an expectation failed. That is deliberate. These exist to catch
 * what reading the code does not, and every defect they have caught — an unsorted eviction
 * throwing away the newest conversation, a list that said "just now" for everything, a
 * dead Alt+T on macOS, two white-screens in the trail — was invisible until something
 * drove it.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `playwright-core` rather than `playwright`: these drivers launch the Chrome already
 * installed on the machine (`channel: 'chrome'`), so the hundreds of megabytes of browsers
 * the full package downloads on install would never be opened. It is a devDependency of
 * `app/`, and the require is lazy so that merely importing this file in an environment
 * without it fails with a sentence instead of a stack.
 */
const require = createRequire(import.meta.url)
let pw
try {
  pw = require('playwright-core')
} catch {
  console.error('e2e: playwright-core is not installed. Run `npm ci` at the repo root.')
  process.exit(2)
}

export const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Screenshots. Gitignored — they are evidence for the session that took them. */
export const SHOTS = process.env.E2E_SHOTS || path.join(HERE, 'shots')
fs.mkdirSync(SHOTS, { recursive: true })

/**
 * Where the dev server is. `npm run dev -w app` prints the port it actually got — it
 * climbs past 5173 when something else holds it, which is normal with more than one
 * checkout open, so this is an environment variable rather than a constant.
 */
export const BASE = process.env.E2E_BASE || 'http://localhost:5173/ragtime'
export const EXPLORER = BASE + '/explorer'

export const log = (...a) => console.log('[e2e]', ...a)

/** A phone, and the desktop width the band is also checked at. */
export const PHONE = { width: 390, height: 844 }
export const DESKTOP = { width: 1440, height: 900 }
function installStub() {
  const BRIEF = {
    goal: 'Find OLC opinions on removing the head of an independent agency without cause.',
    corpora: ['olc', 'litigation'],
    answer_shape: 'a list of opinions with dates and holdings',
    constraints: ['1935–present'],
  }
  const frame = (name, obj) => `event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`

  const orient = (badDetail) => [
    [0, frame('phase', { type: 'phase', phase: 'orient' })],
    [250, frame('text', { type: 'text', delta: 'Let me see what the record holds before proposing anything. ' })],
    [300, frame('tool_call', { type: 'tool_call', step: 1, id: 'tu_1', name: 'search_corpora', input: { query: 'removal independent agency for cause', corpora: ['olc'] } })],
    [700, frame('tool_result', {
      type: 'tool_result', step: 1, id: 'tu_1', name: 'search_corpora', ok: true,
      summary: 'olc 14 · litigation 3',
      detail: badDetail ?? {
        kind: 'search',
        hits: [
          { corpus: 'olc', count: 14, top: [{ id: '1996-08-13-removal', title: 'Removal of the head of an independent agency' }, { id: '2009-04-02-scope', title: 'Scope of the for-cause limit' }] },
          { corpus: 'litigation', count: 3, top: [{ id: 5512, title: 'Seila Law LLC v. CFPB' }] },
          { corpus: 'fr', count: 0, top: [] },
        ],
      },
      corpus: 'olc', count: 14, cost_cents: 0, ms: 612,
    })],
    [80, frame('cost', { type: 'cost', turn_cents: 0.42, conversation_cents: 1, conversation_spend: 0.42, cap_cents: 25, steps: 1, step_cap: 12, ip_calls: 3, ip_cap: 60 })],
    [250, frame('text', { type: 'text', delta: 'There is enough here to be worth a brief. ' })],
    [200, frame('tool_call', { type: 'tool_call', step: 2, id: 'tu_2', name: 'propose_brief', input: { brief: BRIEF } })],
    [200, frame('phase', { type: 'phase', phase: 'orient', outcome: 'brief', brief: BRIEF })],
    [80, frame('cost', { type: 'cost', turn_cents: 0.63, conversation_cents: 1, conversation_spend: 0.63, cap_cents: 25, steps: 2, step_cap: 12, ip_calls: 4, ip_cap: 60 })],
    [60, frame('done', { type: 'done', envelope: 'env_stub_orient_1', stop: 'end_turn', history: [{ role: 'assistant', content: [{ type: 'text', text: 'brief proposed' }] }], calls: 2 })],
  ]

  /** A research turn. `spend` is the running conversation total the cost events carry. */
  const research = (spend, ipCalls, badDetail) => [
    [0, frame('phase', { type: 'phase', phase: 'research' })],
    [250, frame('text', { type: 'text', delta: 'Working the OLC corpus first, then the litigation docket. ' })],
    [300, frame('tool_call', { type: 'tool_call', step: 1, id: 'tr_1', name: 'ask_corpus', input: { corpus: 'olc', question: 'removal for cause' } })],
    [600, frame('tool_result', {
      type: 'tool_result', step: 1, id: 'tr_1', name: 'ask_corpus', ok: true,
      summary: 'a plan: 4 queries, about 3.1¢', detail: badDetail ?? { kind: 'plan', queries: 4, estimated_cost_cents: 3.1, has_token: true },
      cost_cents: 0, ms: 840,
    })],
    [80, frame('cost', { type: 'cost', turn_cents: 1.1, conversation_cents: Math.ceil(spend * 0.4), conversation_spend: spend * 0.4, cap_cents: 25, steps: 1, step_cap: 12, ip_calls: ipCalls - 2, ip_cap: 60 })],
    [400, frame('tool_call', { type: 'tool_call', step: 2, id: 'tr_2', name: 'ask_corpus_execute', input: { token: 'plan_1' } })],
    [900, frame('tool_result', {
      type: 'tool_result', step: 2, id: 'tr_2', name: 'ask_corpus_execute', ok: true,
      summary: '3,140 characters, 9 citations', detail: { kind: 'answer', chars: 3140, citations: 9, candor: 2, cost_cents: 3.1 },
      corpus: 'olc', cost_cents: 3.1, ms: 4120,
    })],
    [80, frame('cost', { type: 'cost', turn_cents: 4.4, conversation_cents: Math.ceil(spend), conversation_spend: spend, cap_cents: 25, steps: 2, step_cap: 12, ip_calls: ipCalls, ip_cap: 60 })],
    [120, frame('handoff', { type: 'handoff', kind: 'document', url: '/corpus/olc/1996-08-13-removal', label: 'Removal of the head of an independent agency (1996)' })],
    [120, frame('handoff', { type: 'handoff', kind: 'workspace', url: '/corpus/olc?q=removal+for+cause', label: 'OLC — removal for cause' })],
    // `__MARK__` stamps an answer so a driver holding more than one conversation can tell
    // whose it is looking at: every conversation here is built from the same brief, so the
    // title cannot answer that and the mark is the only thing that can. It is a token
    // rather than a value because the table below is built once, when the stub installs —
    // reading the mark here would freeze it at page load and every conversation would
    // claim to be the first one. It is substituted as each frame goes out instead.
    [200, frame('text', { type: 'text', delta: '**MARK-__MARK__.** Three opinions are on point.\n\nThe 1996 opinion is the closest: it reads the for-cause provision as a limit on the President rather than a bar, and it distinguishes *Humphrey’s Executor* on the agency’s adjudicatory function. ' })],
    // A citation into this site's own corpus and a link that leaves it, in one answer,
    // because that is what an answer is: markdown a model wrote, mixing the two. Drivers
    // that ask where a link goes need both present to have anything to compare.
    [300, frame('text', { type: 'text', delta: 'Two later opinions (2009, 2019) narrow it without overruling it. See [rt://olc/1996-08-13-removal](rt://olc/1996-08-13-removal), and the commentary at [Lawfare](https://www.lawfaremedia.org/article/removal-power).' })],
    [80, frame('cost', { type: 'cost', turn_cents: 4.4, conversation_cents: Math.ceil(spend), conversation_spend: spend, cap_cents: 25, steps: 2, step_cap: 12, ip_calls: ipCalls, ip_cap: 60 })],
    [60, frame('done', { type: 'done', envelope: 'env_stub_research_1', stop: 'end_turn', history: [{ role: 'assistant', content: [{ type: 'text', text: 'answer' }] }], calls: 3 })],
  ]

  const scenarios = {
    // Turn 1 orients; turn 2 (after accepting the brief) researches to a modest total.
    research: [orient(), research(4.4, 7)],
    // Same, but the conversation total lands past 80% of the 25¢ cap.
    hot: [orient(), research(21.4, 7)],
    // Same, but the daily allowance is the thing that is nearly gone.
    hotpool: [orient(), research(4.4, 55)],
    // A slow research turn that never finishes: the page is taken away mid-stream.
    interrupt: [orient(), research(4.4, 7).map(([d, f], i) => [i > 4 ? 12000 : d, f])],
    // The worker refuses before the stream opens.
    quota: ['REFUSE_QUOTA'],
    // A worker ahead of this build: a detail kind the page has never heard of, and a
    // known kind with its field missing. Both used to white-screen the trail.
    baddetail: [orient({ kind: 'timeline', events: 4 }), research(4.4, 7, { kind: 'search' })],
  }

  let n = 0
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (!(method === 'POST' && url.includes('/explorer/turn'))) return real(input, init)

    const name = window.localStorage.getItem('__rt_scenario') || 'research'
    const turnIndex = Number(window.localStorage.getItem('__rt_turn') || '0')
    const script = (scenarios[name] || scenarios.research)[Math.min(turnIndex, (scenarios[name] || scenarios.research).length - 1)]
    window.localStorage.setItem('__rt_turn', String(turnIndex + 1))
    window.__rtTurnsOpened = (window.__rtTurnsOpened || 0) + 1

    if (script === 'REFUSE_QUOTA') {
      return Promise.resolve(new Response(
        JSON.stringify({ error: { code: 'ip_quota', message: 'Daily model-call allowance reached. Sign in to continue.' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ))
    }

    n++
    const enc = new TextEncoder()
    let cancelled = false
    const stream = new ReadableStream({
      async start(controller) {
        for (const [delay, text] of script) {
          await new Promise((r) => setTimeout(r, delay))
          if (cancelled) return
          try {
            // Substituted as it goes out, so each turn carries the mark set for it.
            controller.enqueue(enc.encode(text.replace('__MARK__', window.localStorage.getItem('__rt_mark') || 'A')))
          } catch {
            return
          }
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      },
      cancel() {
        cancelled = true
      },
    })
    return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  }
}async function state(page) {
  return page.evaluate(() => {
    const ta = document.querySelector('.composer textarea')
    const trailBtn = [...document.querySelectorAll('header button')].find((b) => b.getAttribute('aria-controls') === 'trail')
    return {
      composerDisabled: ta ? ta.disabled : null,
      working: !!document.querySelector('.working'),
      workingText: (document.querySelector('.working') || {}).textContent?.trim().slice(0, 80) ?? null,
      turns: document.querySelectorAll('.conversation .turn').length,
      trail: trailBtn
        // `innerText`, not `textContent`: the control carries its wording twice, once for
        // a phone and once for wider, and only one of them is displayed. `textContent`
        // would concatenate both and report "TrailTrail" — which is also why the button's
        // accessible name is the visible one, since `display: none` is left out of the
        // accessibility tree.
        ? { label: trailBtn.innerText.trim(), hot: /bg-destructive|text-white/.test(trailBtn.className), bg: getComputedStyle(trailBtn).backgroundColor }
        : null,
      startOver: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Start over'),
      researchBtn: [...document.querySelectorAll('button')].some((b) => /^Research$/.test(b.textContent.trim())),
      errors: [...document.querySelectorAll('.error')].map((e) => e.textContent.trim().slice(0, 200)),
      headerAlert: (document.querySelector('header [role="alert"]') || {}).textContent?.trim() ?? null,
      answerChars: [...document.querySelectorAll('.answer')].map((a) => a.textContent.trim().length),
      narration: [...document.querySelectorAll('.steps-summary')].map((s) => s.textContent.trim()),
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight,
      chrome: (() => {
        const hs = [...document.querySelectorAll('header')].map((h) => Math.round(h.getBoundingClientRect().height))
        return { headers: hs, total: hs.reduce((a, b) => a + b, 0) }
      })(),
      tuneOverSend: (() => {
        const send = document.querySelector('.composer button.primary')
        const t = [...document.querySelectorAll('button, div')].find((e) => e.textContent.trim() === 'T' && e.getBoundingClientRect().width < 60 && e.getBoundingClientRect().width > 10)
        if (!send || !t) return null
        const a = send.getBoundingClientRect()
        const b = t.getBoundingClientRect()
        const overlap = !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom)
        return { overlap, send: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width), h: Math.round(a.height) }, handle: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
      })(),
    }
  })
}

async function settle(page, ms = 40000) {
  const t0 = Date.now()
  for (;;) {
    const s = await state(page)
    if (!s.working && s.turns > 0) return s
    if (Date.now() - t0 > ms) return { timedOut: true, ...s }
    await page.waitForTimeout(400)
  }
}const LS = {
  index: 'ragtime_explorer_conversations_v1',
  legacy: 'ragtime_explorer_conversation_v1',
  prefix: 'ragtime_explorer_conversation_v1:',
}

/** What the device holds, as the page would find it on the next visit. */
async function device(page) {
  return page.evaluate((LS) => {
    const blobs = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(LS.prefix)) blobs.push({ cid: k.slice(LS.prefix.length), bytes: localStorage.getItem(k).length })
    }
    let index = null
    try { index = JSON.parse(localStorage.getItem(LS.index)) } catch { /* none */ }
    return {
      legacyStillThere: localStorage.getItem(LS.legacy) !== null,
      blobs: blobs.sort((a, b) => a.cid.localeCompare(b.cid)),
      index: index && { current: index.current, items: index.items.map((i) => ({ cid: i.cid, title: i.title.slice(0, 40), turns: i.turns, cents: i.cents })) },
    }
  }, LS)
}

/** The conversations panel, as a reader sees it. */
async function panel(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')
    if (!sheet) return null
    const rows = [...sheet.querySelectorAll('div.border-b')]
      .map((d) => {
        const b = d.querySelector('button.flex-1')
        return b ? { text: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 90), open: b.getAttribute('aria-current') === 'true' } : null
      })
      .filter(Boolean)
    return {
      title: (sheet.querySelector('h2, [data-slot="sheet-title"]') || {}).textContent?.trim() ?? null,
      newButton: [...sheet.querySelectorAll('button')].some((b) => b.textContent.trim() === 'New conversation'),
      rows,
    }
  })
}

async function openPanel(page) {
  await page.click('header button:has-text("Start over")')
  await page.waitForTimeout(500)
  return panel(page)
}
/** One browser per driver. Chrome as installed, not a downloaded build. */
export async function launch() {
  return pw.chromium.launch({ channel: 'chrome' })
}

/**
 * A context with the beta gate already unlocked, a credential the stub never checks, and
 * the turn stub installed before any app code runs.
 *
 * `seed` is an init script that runs *before* the stub, which is how a driver puts a
 * conversation on the device as though a previous visit had left it there.
 */
export async function ctxWith(browser, { viewport = PHONE, seed = null, scenario = 'research' } = {}) {
  const phone = viewport.width < 700
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: phone,
    isMobile: phone,
    ...(phone
      ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
      : {}),
  })
  await ctx.addInitScript(() => {
    window.localStorage.setItem('ragtime_beta_access_v1', '1')
    window.localStorage.setItem('ragtime_demo_pw', 'stub-not-a-real-password')
  })
  if (seed) await ctx.addInitScript(seed)
  await ctx.addInitScript(`(${installStub.toString()})()`)
  await ctx.addInitScript(([s]) => window.localStorage.setItem('__rt_scenario', s), [scenario])
  return ctx
}

/** Ask, accept the brief, and let the research turn finish. */
export async function conversation(page, question) {
  await page.fill('.composer textarea', question)
  await page.click('.composer button.primary')
  await settle(page)
  await page.click('button.primary:has-text("Research")')
  return settle(page)
}

/**
 * The scoreboard.
 *
 * A driver prints every expectation it checked, passing ones included, because the point
 * of driving is to be able to read afterwards what was actually exercised — a run that
 * only prints failures cannot be told apart from a run that checked nothing.
 */
export function scoreboard(name) {
  const failed = []
  return {
    check(what, ok, detail) {
      if (ok) log('  ok  ', what)
      else {
        log('  FAIL', what, detail === undefined ? '' : JSON.stringify(detail))
        failed.push({ what, detail })
      }
      return ok
    },
    /** Exits non-zero on any failure, so a driver is usable from a script. */
    report() {
      log(failed.length === 0 ? `${name}: all checks passed` : `${name}: ${failed.length} FAILED`)
      return failed.length
    },
    get failed() {
      return failed
    },
  }
}

export { installStub, state, settle, device, panel, openPanel, LS }
