/**
 * The book catalogue spoke, driven against a stubbed Worker.
 *
 * The routes it reads (`/corpus/books/{filter,facets,record,items-by-ids}`) are
 * ragtime-worker#145, which may not be deployed when this runs, so every one of
 * them is answered here with fixtures in #145's response shapes. What is checked:
 * the three deep links the Explorer writes land where they should
 * (`/corpus/books/<id>` → the record sheet; `?ids=…&mode=manual_filter` → exactly
 * those records; `?q=…` → the filter, prefilled and run), a floor count reads as
 * one, sparse filters show their coverage, and the record ends in the handoff
 * ladder with Google Books kept apart from it.
 *
 *   node e2e/books.mjs                  # a phone
 *   E2E_W=1440 node e2e/books.mjs       # and wider
 */
import { launch, ctxWith, log, SHOTS, BASE, PHONE, DESKTOP, scoreboard } from './harness.mjs'

const W = Number(process.env.E2E_W || PHONE.width)
const viewport = W >= 700 ? { ...DESKTOP, width: W } : { ...PHONE, width: W }

const ROW = (id, over = {}) => ({
  id,
  lccn: '2007024871',
  lccn_normalized: '2007024871',
  title: 'The terror presidency :',
  subtitle: 'law and judgment inside the Bush administration /',
  uniform_title: null,
  authors: ['Goldsmith, Jack L.'],
  publisher: 'W.W. Norton,',
  pub_date: 'c2007.',
  pub_date_normalized: 2007,
  edition: '1st ed.',
  classification: 'KF5053',
  language: 'eng',
  original_language: null,
  audience: null,
  extent: '256 p. ;',
  page_count: 256,
  illustrated: false,
  series: null,
  subject_strings: ['War on Terrorism, 2001-2009.', 'Executive power -- United States.'],
  isbn: ['9780393065503 (hardcover)'],
  work_cluster_key: 'the terror presidency|goldsmith, jack l',
  ...over,
})

const FACETS = {
  record_count: 10543015,
  pub_year_min: 1450,
  pub_year_max: 2016,
  source_vintage: 2016,
  public_domain_floor: 1931,
  languages: [{ value: 'eng', count: 7000000 }, { value: 'ger', count: 36900 }],
  audiences: [{ value: 'j', label: 'juvenile (age unspecified)', count: 385409 }],
  decades: [],
  subject_kinds: [],
  coverage: {
    audience: { present: 406644, total: 10543015 },
    page_count: { present: 9404370, total: 10543015 },
    illustrations: { present: 5661598, total: 10543015 },
    language: { present: 10543015, total: 10543015 },
  },
  limits: [
    'Bibliographic metadata only — no full text, no page images, no tables of contents.',
    'The source is LC’s *Books All* bulk MARC, a 2016 snapshot.',
  ],
  facets_computed_at: '2026-09-23 18:00:00+00',
}

async function stubWorker(ctx) {
  await ctx.route(/\/corpus\/books\/(facets|filter|record|items-by-ids)$/, async (route) => {
    const url = route.request().url()
    const body = JSON.parse(route.request().postData() || '{}')
    const reply = (json, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    if (url.endsWith('/facets')) return reply(FACETS)
    if (url.endsWith('/filter')) {
      const broad = !body.fields?.author
      const rows = broad
        ? [ROW(1), ROW(2, { edition: '2nd ed.', pub_date_normalized: 2009 }), ROW(3, { title: 'Power and constraint', subtitle: null, work_cluster_key: 'power and constraint|goldsmith, jack l' })]
        : [ROW(1)]
      return reply({
        ids: rows.map((r) => r.id),
        display_rows: rows,
        count: broad ? 10000 : 1,
        count_is_floor: broad,
        catalogue_vintage: 2016,
        generated_sql: 'SELECT id FROM loc_bibliography …',
        executed_sql: 'SELECT id FROM loc_bibliography …',
      })
    }
    if (url.endsWith('/items-by-ids')) return reply({ display_rows: (body.ids || []).map((id) => ROW(id)) })
    if (url.endsWith('/record')) {
      if (body.id === 404) {
        return reply({ error: { message: 'Not in our catalogue. The catalogue is a 2016 snapshot and is incomplete within its own window, so this is not evidence the work does not exist.', code: 'catalogue_absent' } }, 404)
      }
      const old = body.id === 7
      return reply({
        record: {
          ...ROW(body.id, old ? { title: 'The federalist :', subtitle: null, authors: ['Hamilton, Alexander,'], pub_date_normalized: 1901, isbn: null } : {}),
          control_number: '1', title_normalized: 'the terror presidency',
          contributors: [{ name: 'Goldsmith, Jack L.', tag: '100', kind: 'personal', primary: true, roles: ['author'], authority: 'http://id.loc.gov/authorities/names/n2001000001' }],
          subject_headings: null, subjects: null, oclc_number: '(OCoLC)123', languages: ['eng'],
          illustrations: null, illustration_codes: null, contents: null, summary: 'An insider’s account.',
          source_file: 'BooksAll.2016.part33.xml', source_vintage: 2016, ingested_at: '2026-09-17',
        },
        loc_permalink: 'https://lccn.loc.gov/2007024871',
        likely_public_domain: old,
        audience_label: null,
        text_fields_are_not_searchable: ['contents', 'summary'],
      })
    }
    return route.continue()
  })
}

const board = scoreboard(`books @ ${W}`)
const browser = await launch()
const ctx = await ctxWith(browser, { viewport })
await stubWorker(ctx)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

async function go(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
}
// innerText honours `uppercase`, so headings are matched case-insensitively.
const text = () => page.evaluate(() => document.body.innerText)

// 1. The landing: disclosure, tiles, limits.
await go('/corpus/books')
let t = await text()
board.check('landing says we hold the catalogue, not the books', /not the books/i.test(t))
board.check('holdings tile shows 10,543,015 records', t.includes('10,543,015'))
board.check('limits are one click away', /What this catalogue can.t tell you/i.test(t))
board.check('audience filter shows its coverage with the denominator', t.includes('coded on 3.9% of records (406,644 of 10,543,015)'))
await page.screenshot({ path: `${SHOTS}/books-landing-${W}.png`, fullPage: true })

// 2. `?q=` — prefilled and run; a broad result is a floor.
await go('/corpus/books?q=executive%20power')
t = await text()
board.check('?q= prefills the search box', (await page.inputValue('input[placeholder^="e.g. habeas"]')) === 'executive power')
board.check('a broad filter reads as a floor', t.includes('10,000+ records'))
board.check('shared cluster keys badge as editions', /2 editions here/i.test(t))
await page.screenshot({ path: `${SHOTS}/books-results-${W}.png`, fullPage: true })

// 3. `?ids=…&mode=manual_filter` — exactly those records.
await go('/corpus/books?ids=11,12&mode=manual_filter')
t = await text()
board.check('?ids= loads exactly the linked records', /^2 records$/m.test(t) || t.includes('2 records'))

// 4. `/corpus/books/<id>` — the record sheet, with the ladder.
await go('/corpus/books/1')
t = await text()
board.check('document link opens the record sheet', /Where to read it/i.test(t))
board.check('ladder starts at the LOC entry', await page.locator('a[href="https://lccn.loc.gov/2007024871"]').count() > 0)
board.check('Google Books sits under "Outside RAGtime"', /Outside RAGtime/i.test(t) && await page.locator('a[href^="https://books.google.com/books?vid=ISBN9780393065503"]').count() > 0)
board.check('in-copyright book gets no free-full-text rung', !t.includes('HathiTrust'))
board.check('contributor role shows', /Goldsmith, Jack L\s*author/.test(t))
board.check('unsearchable notes are labelled so', /not searchable/.test(t))
await page.screenshot({ path: `${SHOTS}/books-record-${W}.png`, fullPage: true })

await go('/corpus/books/7')
t = await text()
board.check('likely-public-domain book gets the free full-text rungs', t.includes('HathiTrust') && t.includes('Internet Archive'))

await go('/corpus/books/404')
t = await text()
board.check('an absent id shows the Worker’s catalogue_absent message', t.includes('not evidence the work does not exist'))

board.check('no page errors', errors.length === 0, errors)
log('screenshots in', SHOTS)
await browser.close()
process.exit(board.report() ? 1 : 0)
