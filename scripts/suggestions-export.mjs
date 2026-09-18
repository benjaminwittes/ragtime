#!/usr/bin/env node
/*
 * suggestions-export.mjs — every piece of suggestion copy in the app, in one CSV.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRACT, FOR A HUMAN REVIEWER
 * ---------------------------------------------------------------------------
 *
 *   EDIT ONLY THE `text` COLUMN.
 *
 *   Do not reorder rows. Do not delete rows. Do not add rows.
 *   Do not touch `id` — it is how `suggestions-import.mjs` finds the piece of
 *   source your edit belongs to. Every other column (surface, corpus, group,
 *   slot, mode, kind, renders, retrieval, constraints) is re-derived from the
 *   source on import: editing one changes nothing, and the importer will say
 *   that it ignored you.
 *
 *   `constraints` is the column to read before you write. It carries what the
 *   source files already know — which corpora have no dates, which fields
 *   teach a format rather than a subject, which sentences were measured to fit
 *   the page. A row marked `kind = format-hint` teaches a syntax: turning
 *   `e.g. 2060-AV09` into prose breaks the lesson the field exists to give.
 *
 *   `renders` says where a reader actually sees the string. Some of it renders
 *   nowhere at all; do not spend effort there.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/suggestions-export.mjs                 # write content/suggestions.csv
 *   node scripts/suggestions-export.mjs --out /tmp/x.csv
 *   node scripts/suggestions-export.mjs --check         # re-derive only; print counts
 *   node scripts/suggestions-export.mjs --probe         # ALSO hit the live worker to
 *                                                       # fill `retrieval`. Off by
 *                                                       # default: the worker rate-limits
 *                                                       # at 10 requests/minute per IP,
 *                                                       # so a full pass takes ~4 minutes.
 *
 * No dependencies, no build step. Plain Node ESM, run directly.
 *
 * ---------------------------------------------------------------------------
 * ONE ROW PER STRING, EXCEPT WHERE A STRING IS MIRRORED
 * ---------------------------------------------------------------------------
 *
 * Some strings live in two files at once, byte-identical, with nothing
 * checking that they stay that way:
 *
 *   - the `all` set's three `question` strings in `app/src/hub/samples.ts` are
 *     also `EXAMPLE_QUESTIONS[].text` in `app/src/explorer/model/examples.ts`;
 *   - `SAMPLES[0].titles.explorer` is also the `heading` of the Explorer's
 *     empty state in `app/src/explorer/components/EmptyState.tsx`.
 *
 * Each of those gets ONE row here, and the importer writes BOTH files from it.
 * Two rows that must stay identical is a defect waiting to happen. If
 * `examples.ts` ever grows a question that is NOT in the `all` set, it gets its
 * own `explorer-example` row and this script says so, loudly.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, relative, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const COLUMNS = [
  'id',
  'surface',
  'corpus',
  'group',
  'slot',
  'mode',
  'kind',
  'text',
  'renders',
  'retrieval',
  'constraints',
]

/* ===========================================================================
 * RFC 4180 — a correct-enough CSV, written by hand because Node has none and
 * this script takes no dependencies.
 * ======================================================================== */

/** Quote a field iff it holds a comma, a quote, a CR or an LF. `"` doubles. */
export function csvField(value) {
  const s = value == null ? '' : String(value)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function csvSerialize(rows) {
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n'
}

/**
 * Parse RFC 4180. Handles quoted fields holding commas, doubled quotes and
 * embedded newlines; accepts CRLF, LF or CR line endings, because a
 * spreadsheet picks its own; strips a UTF-8 BOM, which Excel both wants on
 * write and leaves behind on save.
 */
export function csvParse(text) {
  let src = text
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1)
  const rows = []
  let row = []
  let field = ''
  let i = 0
  let inQuotes = false
  let sawAnyChar = false
  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
    sawAnyChar = false
  }
  while (i < src.length) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"' && field === '') {
      inQuotes = true
      sawAnyChar = true
      i++
      continue
    }
    if (c === ',') {
      endField()
      sawAnyChar = true
      i++
      continue
    }
    if (c === '\r') {
      endRow()
      if (src[i + 1] === '\n') i++
      i++
      continue
    }
    if (c === '\n') {
      endRow()
      i++
      continue
    }
    field += c
    sawAnyChar = true
    i++
  }
  if (field !== '' || row.length > 0 || sawAnyChar) endRow()
  return rows
}

/* ===========================================================================
 * Source scanning
 * ======================================================================== */

export function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/**
 * Replace every comment with the same number of spaces (newlines preserved),
 * so a regex can run against the mask while offsets still index the real
 * source. Nothing here may read a suggestion out of a comment, and nothing may
 * write into one.
 *
 * String and template literals are skipped intact — they are what we are
 * looking for. Regex literals are skipped too, because `/\/\//` would
 * otherwise read as the start of a line comment and blank the rest of a line
 * of real code.
 */
export function maskComments(src) {
  const out = src.split('')
  const n = src.length
  // Characters after which a `/` opens a regex rather than dividing.
  // Deliberately excludes `<`, `>`, `)`, `]` and `}`: `</div>` and `<Foo />`
  // are the common case in .tsx and must not read as regex openers.
  const REGEX_PRE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';'])
  let prev = ''
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') {
        out[i] = ' '
        i++
      }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < n) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      i = scanLiteral(src, i).end
      prev = c
      continue
    }
    if (c === '/' && (prev === '' || REGEX_PRE.has(prev))) {
      let j = i + 1
      let inClass = false
      let closed = false
      while (j < n) {
        const d = src[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '\n') break
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) {
          j++
          closed = true
          break
        }
        j++
      }
      if (closed) {
        i = j
        prev = '/'
        continue
      }
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }

/**
 * Read the string or template literal whose opening quote sits at `i`.
 * Returns `{ start, end, quote, value }`; `end` is one past the closing quote.
 */
export function scanLiteral(src, i) {
  const q = src[i]
  let j = i + 1
  let value = ''
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') {
      const e = src[j + 1]
      value += Object.prototype.hasOwnProperty.call(ESCAPES, e) ? ESCAPES[e] : e
      j += 2
      continue
    }
    if (c === q) {
      j++
      break
    }
    value += c
    j++
  }
  return { start: i, end: j, quote: q, value }
}

/** Index of the delimiter closing the one at `i`, skipping string literals. */
function matchDelim(src, i, open, close) {
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === "'" || c === '"' || c === '`') {
      j = scanLiteral(src, j).end - 1
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return j
    }
  }
  return -1
}

/** Every string literal at any depth between `from` and `to`. */
function literalsIn(src, from, to) {
  const out = []
  for (let j = from; j < to; j++) {
    const c = src[j]
    if (c === "'" || c === '"' || c === '`') {
      const lit = scanLiteral(src, j)
      out.push(lit)
      j = lit.end - 1
    }
  }
  return out
}

function lineOf(src, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (src[i] === '\n') line++
  return line
}

/** Every `<key>: <string literal>` between `from` and `to`, in source order. */
function keyLiterals(src, mask, from, to, key) {
  const re = new RegExp('(?:^|[^A-Za-z0-9_$])' + key + '\\s*:\\s*', 'g')
  re.lastIndex = from
  const out = []
  let m
  while ((m = re.exec(mask)) !== null) {
    if (m.index >= to) break
    const at = m.index + m[0].length
    const c = mask[at]
    if (c !== "'" && c !== '"' && c !== '`') continue
    const lit = scanLiteral(src, at)
    out.push(lit)
    re.lastIndex = lit.end
  }
  return out
}

function joinNotes(parts) {
  return parts.filter((p) => p && p.length).join('; ')
}

/**
 * The `[` that opens the array literal of `export const NAME…= [`.
 *
 * Not simply the next `[` after the name: these declarations are typed, and
 * `export const SAMPLES: readonly SampleSet[] = [` puts an empty pair of
 * brackets in the way. Searching past the `=` is the whole point.
 */
function arrayOpenerAfter(mask, declaration) {
  const at = mask.indexOf(declaration)
  if (at < 0) return -1
  const eq = mask.indexOf('=', at)
  if (eq < 0) return -1
  const open = mask.indexOf('[', eq)
  return open
}

/* ===========================================================================
 * The editorial facts that must reach a reviewer.
 *
 * Every line below is already written down in the source it describes; this
 * table is the only place they are collected, and the only reason they reach a
 * spreadsheet at all.
 * ======================================================================== */

const CORPUS_CONSTRAINT = {
  all: '',
  usc: '',
  cfr: 'the CFR is current state only — nothing may ask how a rule changed',
  congress: 'Congress reaches 1789 only for public laws; hearings from 1933',
  fr: 'the Federal Register’s rules are complete from 1994; notices are still loading',
  presidential:
    'this keyword index matches loosely — check a query by reading the order titles it returns, never by its count',
  olc: '',
  litigation:
    'litigation starts 2025-01-20, and its keyword index runs over docket-entry descriptions — a multi-word subject phrase matches near-randomly there',
  frus: 'FRUS volumes end with the Cold War — every question here is a historical one',
  fbi: 'the FBI Vault has no document dates — nothing may ask when',
  sanctions:
    'Sanctions has no designation dates — publish_date is a copy-freshness stamp for the list data, not a designation date',
  commentary:
    'two publications only, Lawfare and Executive Functions — naming an author is a promise the federation may stop keeping',
  lawfare: 'the standalone Lawfare spoke is retired into Commentary',
  clemency: '',
  '': '',
}

const TITLE_CONSTRAINT = 'measured to wrap at 1100/390 — a longer sentence changes the page'

const MIRROR_QUESTION_CONSTRAINT =
  'mirrored: this exact string is also EXAMPLE_QUESTIONS[].text in app/src/explorer/model/examples.ts, and the importer writes both files from this one row'

const MIRROR_TITLE_CONSTRAINT =
  'mirrored: this exact string is also the Explorer empty state’s heading in app/src/explorer/components/EmptyState.tsx, and the importer writes both files from this one row'

const SHAPE_CONSTRAINT = {
  list: 'the answer shape is a list — the wording must keep asking for one ("List the opinions.")',
  count: 'the answer shape is a count — the wording must keep asking "How many…"',
  narrative:
    'the answer shape is a narrative — the wording must keep asking for one ("A short narrative with citations.")',
}

const CHIP_RENDERS = 'nowhere — declared but never read'
const CHIP_CONSTRAINT =
  'suggestionChips is declared by six spokes and read by nothing in app/src; polishing it changes no screen'

const DOCS_CONSTRAINT =
  'markdown inside a template literal — the importer rewrites only this paragraph and re-wraps it to the column width the file already uses'

const LAWFARE_DEAD_RENDERS =
  'nowhere — the Lawfare spoke is retired into Commentary and is not registered, so this surface never mounts'

/**
 * Placeholders that teach a syntax rather than a subject. A reviewer who turns
 * one of these into prose breaks the lesson the field exists to give, so they
 * carry `kind = format-hint` and say so in `constraints`.
 *
 * The first eleven are the ones named in the brief. The last four are the same
 * families, caught by reading the forms: Federal Register title and part
 * numbers sit beside the CFR part number already on the list, and a
 * district-court code and a Bioguide id are formats a reader has to type
 * exactly.
 */
const FORMAT_HINTS = new Map([
  ['e.g. 14239', 'an executive order number'],
  ['e.g. 2060-AV09', 'a Regulation Identifier Number (RIN)'],
  ['e.g. R000584', 'a Bioguide id'],
  ['e.g. 164', 'a CFR part number'],
  ['e.g. frus1969-76v01', 'a FRUS volume id'],
  ['e.g. 45 CFR 164.502', 'a CFR citation'],
  ['e.g. 8 U.S.C. § 1225', 'a U.S. Code citation'],
  ['e.g. 118', 'a Congress number'],
  ['e.g. P000605', 'a Bioguide id'],
  ['e.g. Definitions', 'a section heading, matched as stored'],
  ['e.g. Inspection', 'a section heading, matched as stored'],
  ['e.g. 31', 'a Federal Register CFR title number'],
  ['e.g. 594', 'a Federal Register CFR part number'],
  ['e.g. S.D.N.Y., D.C.', 'a district-court code'],
  ['e.g. Comey — or R000584', 'a name, or a Bioguide id'],
])

const FORMAT_HINT_CONSTRAINT =
  'format-hint: this teaches the field’s syntax, not a subject — prose here breaks the lesson'

/** Where a placeholder is actually read, in plain words, by the file it lives in. */
function placeholderRenders(short) {
  const file = basename(short)
  if (short.startsWith('spokes/lawfare/')) return LAWFARE_DEAD_RENDERS
  if (file === 'FilterForm.tsx') return 'every spoke, filter form'
  if (file === 'ClaudeAmaForm.tsx') return 'every spoke, Ask panel'
  if (file === 'ClaudeReadForm.tsx') return 'every spoke, Read panel'
  if (file === 'ClaudeSqlForm.tsx') return 'every spoke, SQL panel'
  if (file === 'ClaudeAnalysisForm.tsx') return 'every spoke, Analyze panel'
  if (file === 'MoreLikeThisPrompt.tsx') return 'every spoke, more-like-this prompt'
  if (file === 'TurnsSurface.tsx') return 'congress, hearing-turns surface'
  if (file.endsWith('FilterForm.tsx')) return 'spoke filter form'
  return 'spoke form'
}

/* ===========================================================================
 * Extractors. Each returns records carrying both the CSV columns and the spans
 * the importer writes back into.
 * ======================================================================== */

const HUB_FILE = 'app/src/hub/samples.ts'
const EXAMPLES_FILE = 'app/src/explorer/model/examples.ts'
const EMPTY_STATE_FILE = 'app/src/explorer/components/EmptyState.tsx'

/** `SAMPLES` in app/src/hub/samples.ts — 12 sets, 24 titles, 72 sample strings. */
function readHubSets() {
  const src = read(HUB_FILE)
  const mask = maskComments(src)
  const arrOpen = arrayOpenerAfter(mask, 'export const SAMPLES')
  if (arrOpen < 0) throw new Error('SAMPLES not found in ' + HUB_FILE)
  const arrClose = matchDelim(mask, arrOpen, '[', ']')

  // The group headings are section comments, so they are read from the real
  // source rather than the mask. Anything before the first one is "the whole".
  const groups = [...src.matchAll(/\/\*\s*-{2,}\s*(.+?)\s*-{2,}\s*\*\//g)].map((m) => ({
    at: m.index,
    name: m[1].trim(),
  }))
  const groupAt = (offset) => {
    let name = 'the whole'
    for (const g of groups) if (g.at < offset) name = g.name
    return name
  }

  const slugs = []
  const re = /(?:^|[^A-Za-z0-9_$])slug:\s*'([^']+)'/g
  re.lastIndex = arrOpen
  let m
  while ((m = re.exec(mask)) !== null) {
    if (m.index >= arrClose) break
    slugs.push({ slug: m[1], at: m.index })
  }

  return slugs.map((s, i) => {
    const from = s.at
    const to = i + 1 < slugs.length ? slugs[i + 1].at : arrClose
    const titlesKey = mask.indexOf('titles:', from)
    const titlesOpen = mask.indexOf('{', titlesKey)
    const titlesClose = matchDelim(mask, titlesOpen, '{', '}')
    const [searchLit] = keyLiterals(src, mask, titlesOpen, titlesClose, 'search')
    const [explorerLit] = keyLiterals(src, mask, titlesOpen, titlesClose, 'explorer')
    const queries = keyLiterals(src, mask, titlesClose, to, 'query')
    const questions = keyLiterals(src, mask, titlesClose, to, 'question')
    if (!searchLit || !explorerLit) throw new Error('missing titles for set ' + s.slug)
    if (queries.length !== 3 || questions.length !== 3) {
      throw new Error(
        'expected 3 query + 3 question in set ' +
          s.slug +
          ', got ' +
          queries.length +
          ' + ' +
          questions.length,
      )
    }
    return {
      slug: s.slug,
      group: groupAt(from),
      titles: { search: searchLit, explorer: explorerLit },
      queries,
      questions,
    }
  })
}

function tsSpan(file, lit) {
  return { file, start: lit.start, end: lit.end, encode: 'ts', quote: lit.quote }
}

function extractHubAndExplorer(warnings) {
  const hubSrc = read(HUB_FILE)
  const sets = readHubSets()
  const records = []

  // The verification date the file's own header records, so `retrieval` says
  // something true rather than something invented.
  const checked = /most recently on (\d{4}-\d{2}-\d{2})/.exec(hubSrc)
  const checkedOn = checked ? checked[1] : null
  const retrievalFor = (slug) => {
    if (!checkedOn) return ''
    if (slug === 'sanctions') {
      return (
        'checked ' + checkedOn + ' against the sanctions entity and guidance filters (hits not recorded)'
      )
    }
    return 'checked ' + checkedOn + ' via /corpus/hub/keyword scoped to this corpus (hits not recorded)'
  }

  // examples.ts — the mirror.
  const exSrc = read(EXAMPLES_FILE)
  const exMask = maskComments(exSrc)
  const exOpen = arrayOpenerAfter(exMask, 'export const EXAMPLE_QUESTIONS')
  const exClose = matchDelim(exMask, exOpen, '[', ']')
  const exTexts = keyLiterals(exSrc, exMask, exOpen, exClose, 'text')
  const exShapes = [...exMask.slice(exOpen, exClose).matchAll(/shape:\s*'([a-z]+)'/g)].map((m) => m[1])

  // EmptyState.tsx — the second mirror, of the `all` set's explorer title.
  const esSrc = read(EMPTY_STATE_FILE)
  const esMask = maskComments(esSrc)
  const esHeading = /heading="([^"]*)"/.exec(esMask)
  const esSpan = esHeading
    ? {
        file: EMPTY_STATE_FILE,
        start: esHeading.index + 'heading="'.length,
        end: esHeading.index + 'heading="'.length + esHeading[1].length,
        encode: 'attr',
      }
    : null

  const mirrored = new Set()

  for (const set of sets) {
    for (const mode of ['search', 'explorer']) {
      const lit = set.titles[mode]
      const isMirrorSite = set.slug === 'all' && mode === 'explorer' && Boolean(esHeading)
      const isMirroredTitle = isMirrorSite && esHeading[1] === lit.value
      if (isMirrorSite && !isMirroredTitle) {
        warnings.push(
          'MIRROR DRIFT: samples.ts SAMPLES[0].titles.explorer is ' +
            JSON.stringify(lit.value) +
            ' but the EmptyState.tsx heading is ' +
            JSON.stringify(esHeading[1]) +
            ' — they are supposed to be word for word. Exported as separate strings; fix the drift by hand.',
        )
      }
      records.push({
        id: 'hub.' + set.slug + '.title.' + mode,
        surface: 'hub-title',
        corpus: set.slug,
        group: set.group,
        slot: '',
        mode,
        kind: 'suggestion',
        text: lit.value,
        renders:
          'hub, resting state (the h1)' + (isMirroredTitle ? '; explorer empty state (the heading)' : ''),
        retrieval: '',
        constraints: joinNotes([
          TITLE_CONSTRAINT,
          isMirroredTitle ? MIRROR_TITLE_CONSTRAINT : '',
          CORPUS_CONSTRAINT[set.slug],
        ]),
        writes: [tsSpan(HUB_FILE, lit), ...(isMirroredTitle && esSpan ? [esSpan] : [])],
      })
    }

    for (let i = 0; i < 3; i++) {
      const slot = String(i + 1)
      const q = set.queries[i]
      records.push({
        id: 'hub.' + set.slug + '.s' + slot + '.query',
        surface: 'hub-sample',
        corpus: set.slug,
        group: set.group,
        slot,
        mode: 'search',
        kind: 'suggestion',
        text: q.value,
        renders: 'hub, resting state (typed into the box)',
        retrieval: retrievalFor(set.slug),
        constraints: joinNotes([
          'keyword mode — a phrase, a name or a citation, never a question',
          CORPUS_CONSTRAINT[set.slug],
        ]),
        writes: [tsSpan(HUB_FILE, q)],
      })

      const a = set.questions[i]
      const exIdx = set.slug === 'all' ? exTexts.findIndex((t) => t.value === a.value) : -1
      records.push({
        id: 'hub.' + set.slug + '.s' + slot + '.question',
        surface: 'hub-sample',
        corpus: set.slug,
        group: set.group,
        slot,
        mode: 'explorer',
        kind: 'suggestion',
        text: a.value,
        renders:
          'hub, resting state (typed into the box)' +
          (exIdx >= 0 ? '; explorer empty state (an example button)' : ''),
        retrieval: '',
        constraints: joinNotes([
          'explorer mode — the topic in the reader’s own words',
          exIdx >= 0 ? MIRROR_QUESTION_CONSTRAINT : '',
          exIdx >= 0 ? SHAPE_CONSTRAINT[exShapes[exIdx]] || '' : '',
          CORPUS_CONSTRAINT[set.slug],
        ]),
        writes: [tsSpan(HUB_FILE, a), ...(exIdx >= 0 ? [tsSpan(EXAMPLES_FILE, exTexts[exIdx])] : [])],
      })
      if (exIdx >= 0) mirrored.add(exIdx)
      if (set.slug === 'all' && exIdx < 0) {
        warnings.push(
          'MIRROR DRIFT: the `all` set question ' +
            JSON.stringify(a.value) +
            ' is not in EXAMPLE_QUESTIONS — samples.ts and examples.ts have diverged.',
        )
      }
    }
  }

  // Anything in examples.ts the `all` set does not already carry gets its own
  // row, and says so loudly.
  const orphans = []
  exTexts.forEach((lit, i) => {
    if (mirrored.has(i)) return
    warnings.push(
      'UNMIRRORED EXAMPLE: EXAMPLE_QUESTIONS[' +
        i +
        '] is ' +
        JSON.stringify(lit.value) +
        ' — no `all` sample in samples.ts carries it. Exported as its own explorer-example row; ' +
        'the two files are supposed to be word for word.',
    )
    orphans.push({
      id: 'explorer-example.' + (i + 1),
      surface: 'explorer-example',
      corpus: 'all',
      group: '',
      slot: String(i + 1),
      mode: 'explorer',
      kind: 'suggestion',
      text: lit.value,
      renders: 'explorer empty state (an example button)',
      retrieval: '',
      constraints: joinNotes([
        'UNMIRRORED — this string is in examples.ts but not in the hub’s `all` set, and the two are supposed to match',
        SHAPE_CONSTRAINT[exShapes[i]] || '',
      ]),
      writes: [tsSpan(EXAMPLES_FILE, lit)],
    })
  })

  if (exTexts.length !== 3) {
    warnings.push('EXAMPLE_QUESTIONS has ' + exTexts.length + ' entries; 3 expected.')
  }

  return { records, orphans }
}

/** `suggestionChips` in app/src/spokes/<slug>/index.ts. */
function extractChips() {
  const dir = 'app/src/spokes'
  const slugs = readdirSync(join(ROOT, dir))
    .filter((d) => statSync(join(ROOT, dir, d)).isDirectory())
    .sort()
  const records = []
  for (const slug of slugs) {
    const rel = dir + '/' + slug + '/index.ts'
    let src
    try {
      src = read(rel)
    } catch {
      continue
    }
    const mask = maskComments(src)
    const key = mask.indexOf('suggestionChips:')
    if (key < 0) continue
    const open = mask.indexOf('[', key)
    const close = matchDelim(mask, open, '[', ']')
    literalsIn(src, open + 1, close).forEach((lit, i) => {
      records.push({
        id: 'chip.' + slug + '.' + (i + 1),
        surface: 'spoke-chip',
        corpus: slug,
        group: '',
        slot: String(i + 1),
        mode: '',
        kind: 'suggestion',
        text: lit.value,
        renders: CHIP_RENDERS,
        retrieval: '',
        constraints: joinNotes([CHIP_CONSTRAINT, CORPUS_CONSTRAINT[slug] || '']),
        writes: [tsSpan(rel, lit)],
      })
    })
  }
  return records
}

/* --- docs: markdown blocks inside a `content:` template literal ----------- */

/** The raw span of the `content:` template literal in a docs entry file. */
function contentSpan(src, mask) {
  const key = /(?:^|[^A-Za-z0-9_$])content:\s*/.exec(mask)
  if (!key) return null
  const at = key.index + key[0].length
  if (mask[at] !== '`') return null
  const lit = scanLiteral(src, at)
  return { start: lit.start + 1, end: lit.end - 1 }
}

/** Split a demo-queries paragraph on the `;` separators that sit outside quotes. */
function splitTopLevelSemicolons(text) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') inQuotes = !inQuotes
    if (c === ';' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim() !== '') out.push(cur.trim())
  return out
}

export function wrapText(text, width, firstPrefix, contPrefix) {
  const words = text.split(' ').filter((w) => w !== '')
  const lines = []
  let cur = null
  for (const w of words) {
    if (cur === null) {
      cur = firstPrefix + w
      continue
    }
    if ((cur + ' ' + w).length <= width) cur += ' ' + w
    else {
      lines.push(cur)
      cur = contPrefix + w
    }
  }
  if (cur !== null) lines.push(cur)
  return lines.join('\n')
}

/**
 * Re-render a block from its items.
 *
 * A bullet whose text did not change is emitted from its original lines,
 * exactly as it was — several of these lists are hand-wrapped and no single
 * column reproduces them, so re-wrapping a neighbour to fix one bullet would
 * churn prose nobody edited. A paragraph has no such seam: its items share
 * lines, so it re-wraps whole.
 */
export function renderBlock(block, items) {
  if (block.form === 'paragraph') {
    return wrapText(block.prefix + items.join('; '), block.width, '', '')
  }
  return items
    .map((t, i) =>
      block.rawItems && block.rawItems[i] !== undefined && t === block.items[i]
        ? block.rawItems[i]
        : wrapText(t, block.width, '- ', '  '),
    )
    .join('\n')
}

/** The same, ignoring the originals — used to measure the file's wrap column. */
function renderFresh(block, items) {
  if (block.form === 'paragraph') {
    return wrapText(block.prefix + items.join('; '), block.width, '', '')
  }
  return items.map((t) => wrapText(t, block.width, '- ', '  ')).join('\n')
}

/**
 * Pick the wrap column that reproduces the block byte for byte.
 *
 * Measured from the block itself rather than hard-coded, because these files
 * are not all wrapped at the same column: the search starts at the block's own
 * widest line — no wrap can be narrower than that — and walks outwards.
 *
 * Two of these blocks are hand-wrapped and no single column reproduces them.
 * There the block's widest line is used for whatever is actually edited, and
 * every item nobody touched keeps its own line breaks, so a hand-set break
 * survives unless the reviewer rewrites the sentence it sits in.
 */
function fitWidth(block, items, original, warnings, where) {
  const blockWidth = maxLineWidth(original)
  const candidates = [blockWidth]
  for (let d = 1; d <= 40; d++) candidates.push(blockWidth + d, blockWidth - d)
  for (const w of candidates) {
    if (w < 40 || w > 140) continue
    if (renderFresh({ ...block, width: w }, items) === original) return { width: w, fitted: true }
  }
  warnings.push(
    'WRAP: ' +
      where +
      ' is hand-wrapped — no single column reproduces it, so its own widest line (' +
      blockWidth +
      ') is the column used for an item that is actually edited. Untouched items keep their line breaks.',
  )
  return { width: blockWidth, fitted: false }
}

function maxLineWidth(text) {
  return text.split('\n').reduce((a, l) => Math.max(a, l.length), 0)
}

/**
 * Locate one markdown block: either a `**Marker:**` paragraph whose items are
 * separated by `; `, or a `- ` bullet list under a `**Marker**` line. The
 * returned span covers only the block — never the marker line of a bullet
 * list, never the prose around it, never a comment.
 */
function findBlock(src, span, marker, warnings, where) {
  const body = src.slice(span.start, span.end)
  const at = body.indexOf(marker)
  if (at < 0) return null

  // Paragraph form: the items follow the marker on the same line.
  const afterMarker = body.slice(at + marker.length)
  if (!/^[ \t]*\n/.test(afterMarker)) {
    let end = body.indexOf('\n\n', at)
    if (end < 0) end = body.length
    // The block ends at its last word, never at the blank line or the final
    // newline before the closing backtick — that whitespace belongs to the file.
    while (end > at && /\s/.test(body[end - 1])) end--
    const original = body.slice(at, end)
    const unwrapped = original.replace(/\n[ \t]*/g, ' ')
    const prefix = marker + ' '
    if (!unwrapped.startsWith(prefix)) return null
    const items = splitTopLevelSemicolons(unwrapped.slice(prefix.length))
    if (prefix + items.join('; ') !== unwrapped) {
      warnings.push(
        'PARAGRAPH: re-joining the items of ' +
          where +
          ' does not reproduce the original; the separator is not a plain "; ".',
      )
    }
    const block = { form: 'paragraph', prefix, width: 0 }
    const fit = fitWidth(block, items, original, warnings, where)
    return {
      start: span.start + at,
      end: span.start + end,
      form: 'paragraph',
      prefix,
      width: fit.width,
      fitted: fit.fitted,
      items,
      original,
    }
  }

  // Bullet form: the list opens at the first `- ` after the marker line.
  const listStart = body.indexOf('\n- ', at)
  if (listStart < 0) return null
  const from = listStart + 1
  let end = body.indexOf('\n\n', from)
  if (end < 0) end = body.length
  while (end > from && /\s/.test(body[end - 1])) end--
  const original = body.slice(from, end)
  const items = []
  const rawItems = []
  for (const line of original.split('\n')) {
    if (line.startsWith('- ')) {
      items.push(line.slice(2))
      rawItems.push(line)
    } else if (items.length) {
      items[items.length - 1] += ' ' + line.trim()
      rawItems[rawItems.length - 1] += '\n' + line
    } else return null
  }
  const block = { form: 'bullets', prefix: '', width: 0 }
  const fit = fitWidth(block, items, original, warnings, where)
  return {
    start: span.start + from,
    end: span.start + end,
    form: 'bullets',
    prefix: '',
    width: fit.width,
    fitted: fit.fitted,
    items,
    rawItems,
    original,
  }
}

function docsFiles(pattern) {
  const dir = 'app/src/docs/content'
  return readdirSync(join(ROOT, dir))
    .filter((f) => pattern.test(f))
    .sort()
    .map((f) => dir + '/' + f)
}

function docsRenders(corpus) {
  return corpus === 'lawfare' ? LAWFARE_DEAD_RENDERS : 'docs overlay'
}

function extractDocsBlocks(pattern, markers, surface, idPrefix, warnings, blocks) {
  const records = []
  for (const rel of docsFiles(pattern)) {
    const src = read(rel)
    const mask = maskComments(src)
    const span = contentSpan(src, mask)
    if (!span) continue
    const slugMatch = /spokeSlug:\s*'([^']+)'/.exec(mask)
    const corpus = slugMatch ? slugMatch[1] : ''
    const stem = basename(rel, '.ts')
    let block = null
    let markerUsed = null
    for (const marker of markers) {
      block = findBlock(src, span, marker, warnings, rel + ' ' + marker)
      if (block) {
        markerUsed = marker
        break
      }
    }
    if (!block) continue
    block.file = rel
    block.key = rel + ':' + block.start
    block.marker = markerUsed
    blocks.set(block.key, block)
    block.items.forEach((text, i) => {
      records.push({
        id: idPrefix + '.' + stem + '.' + (i + 1),
        surface,
        corpus,
        group: '',
        slot: String(i + 1),
        mode: '',
        kind: 'suggestion',
        text,
        renders: docsRenders(corpus),
        retrieval: '',
        constraints: joinNotes([
          DOCS_CONSTRAINT,
          markerUsed !== markers[0]
            ? 'this file marks the block ' + markerUsed + ' and uses a bullet list, not the usual paragraph'
            : '',
          CORPUS_CONSTRAINT[corpus] || '',
        ]),
        block: block.key,
        blockIndex: i,
        writes: [],
      })
    })
  }
  return records
}

/* --- placeholders -------------------------------------------------------- */

function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir)).sort()) {
    const rel = dir + '/' + entry
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else out.push(rel)
  }
  return out
}

function extractPlaceholders() {
  const files = walk('app/src/spokes').filter((f) => f.endsWith('.tsx'))
  const records = []
  for (const rel of files) {
    const src = read(rel)
    const mask = maskComments(src)
    const short = relative('app/src', rel)
    const dirSlug = rel.split('/')[3]
    const corpus = dirSlug === 'components' || dirSlug === 'more-like-this' ? '' : dirSlug
    let n = 0
    for (const m of mask.matchAll(/placeholder="(e\.g\.[^"]*)"/g)) {
      n++
      const valueStart = m.index + 'placeholder="'.length
      const value = src.slice(valueStart, valueStart + m[1].length)
      const line = lineOf(src, m.index)
      const hint = FORMAT_HINTS.get(value)
      const extra = []
      if (hint) extra.push(FORMAT_HINT_CONSTRAINT + ' (' + hint + ')')
      if (short === 'spokes/fbi/FbiFilterForm.tsx' && line === 248) {
        extra.push(
          'LIVE BUG: this is the FBI collection typeahead, so its example must match a real stored collection value. It does not — the stored values are "cointel-pro" and "D-B-Cooper " (with a trailing space), so "COINTELPRO" and "D.B. Cooper" match nothing in the box they label',
        )
      }
      records.push({
        id: 'placeholder.' + short + ':' + line,
        surface: 'placeholder',
        corpus,
        group: '',
        slot: String(n),
        mode: '',
        kind: hint ? 'format-hint' : 'suggestion',
        text: value,
        renders: placeholderRenders(short),
        retrieval: '',
        constraints: joinNotes([...extra, CORPUS_CONSTRAINT[corpus] || '']),
        writes: [{ file: rel, start: valueStart, end: valueStart + m[1].length, encode: 'attr' }],
      })
    }
  }
  return records
}

/* ===========================================================================
 * The whole set, in the order the CSV carries it.
 * ======================================================================== */

export function buildRecords() {
  const warnings = []
  const blocks = new Map()
  const { records: hub, orphans } = extractHubAndExplorer(warnings)
  const chips = extractChips()
  const demo = extractDocsBlocks(
    /^about-.*\.ts$/,
    ['**Demo queries:**', '**Demo queries to try:**'],
    'docs-demo',
    'docs-demo',
    warnings,
    blocks,
  )
  const good = extractDocsBlocks(
    /-narrative-synthesis\.ts$/,
    ['**Good questions to ask.**'],
    'docs-good-question',
    'docs-good-question',
    warnings,
    blocks,
  )
  const placeholders = extractPlaceholders()
  const records = [...hub, ...orphans, ...chips, ...demo, ...good, ...placeholders]

  const seen = new Set()
  for (const r of records) {
    if (seen.has(r.id)) throw new Error('duplicate id: ' + r.id)
    seen.add(r.id)
  }
  return { records, blocks, warnings }
}

export function toRow(r) {
  return COLUMNS.map((c) => r[c] ?? '')
}

/* ===========================================================================
 * --probe: the live worker, paced under its own rate limit.
 * ======================================================================== */

const WORKER = 'https://ragtimeproxy.benjamin-wittes.workers.dev'
const PACE_MS = 6500 // 10 requests/minute per IP, with room to spare

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probeOne(query, corpus) {
  // Sanctions sits outside the hub fan (HUB_KEYWORD_SPOKES), so it is asked
  // through its own entity filter instead.
  const url =
    corpus === 'sanctions'
      ? WORKER + '/corpus/sanctions/entity-filter'
      : WORKER + '/corpus/hub/keyword'
  const body =
    corpus === 'sanctions'
      ? { fields: { search: query } }
      : { query, ...(corpus && corpus !== 'all' ? { corpora: [corpus] } : {}) }
  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { error: 'network: ' + (e && e.message ? e.message : e) }
  }
  if (r.status === 429) return { retryAfter: Number(r.headers.get('retry-after')) || 60 }
  if (!r.ok) return { error: 'HTTP ' + r.status }
  const j = await r.json()
  if (corpus === 'sanctions') return { text: 'sanctions: ' + j.count + ' entities' }
  if (corpus === 'all') {
    const total = Object.values(j.per_corpus || {}).reduce((a, b) => a + (b.count || 0), 0)
    return { text: 'all corpora: ' + total + ' hits' }
  }
  const block = (j.per_corpus || {})[corpus]
  if (!block) return { error: 'no per_corpus block for ' + corpus }
  if (block.error) return { error: block.error }
  return { text: corpus + ': ' + block.count + ' hits' }
}

async function probe(records) {
  const targets = records.filter((r) => r.surface === 'hub-sample' && r.mode === 'search')
  const stamp = new Date().toISOString().slice(0, 10)
  process.stderr.write(
    'probing ' +
      targets.length +
      ' queries against the live worker, one every ' +
      PACE_MS / 1000 +
      's (~' +
      Math.ceil((targets.length * PACE_MS) / 60000) +
      ' min)\n',
  )
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i]
    if (i > 0) await sleep(PACE_MS)
    let res = await probeOne(r.text, r.corpus)
    if (res.retryAfter) {
      process.stderr.write('  429 — waiting ' + res.retryAfter + 's\n')
      await sleep(res.retryAfter * 1000)
      res = await probeOne(r.text, r.corpus)
    }
    r.retrieval = res.text
      ? res.text + ' (probed ' + stamp + ')'
      : 'probe failed: ' + (res.error || 'rate limited')
    process.stderr.write('  ' + r.id + ' -> ' + r.retrieval + '\n')
  }
}

/* ===========================================================================
 * main
 * ======================================================================== */

async function main(argv) {
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'content/suggestions.csv'
  const { records, warnings } = buildRecords()

  for (const w of warnings) process.stderr.write('WARNING: ' + w + '\n')

  if (argv.includes('--probe')) await probe(records)

  const counts = {}
  for (const r of records) counts[r.surface] = (counts[r.surface] || 0) + 1
  for (const [surface, n] of Object.entries(counts)) {
    process.stdout.write('  ' + surface.padEnd(22) + String(n).padStart(4) + '\n')
  }
  process.stdout.write('  ' + 'TOTAL'.padEnd(22) + String(records.length).padStart(4) + '\n')

  if (argv.includes('--check')) return

  const csv = csvSerialize([COLUMNS, ...records.map(toRow)])
  mkdirSync(dirname(resolve(ROOT, out)), { recursive: true })
  // A UTF-8 BOM, because this file is opened in Excel and carries em dashes,
  // section signs and curly quotes. `csvParse` strips it on the way back in.
  writeFileSync(resolve(ROOT, out), '\ufeff' + csv, 'utf8')
  process.stdout.write('wrote ' + out + '\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(String(e && e.stack ? e.stack : e) + '\n')
    process.exit(1)
  })
}
