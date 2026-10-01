/**
 * The record on stage: a search brought on as objects.
 *
 * The house (`stage.css`) is a theatre, and what it is a theatre *of* is the record, not
 * the people talking about it. So a result is not a row and not a card: it is a thing
 * standing on a floor, and everything about how it stands says something true about the
 * document it is. Nothing here is decoration, and nothing is a character. The rule that
 * keeps it honest:
 *
 * **A visible property is a field, or it is absent.** Height is length. Where it stands
 * along the floor is its date, or its place in the Code. Which row it stands in is what
 * kind of document it is. Its face is whether it is in force; its edge is how it reached
 * the public; its cap is whether it is finished; the film over it is how well its text
 * was read. A document whose length is unknown is drawn hollow rather than given a
 * plausible height, and one with no date stands in the wings rather than being placed.
 *
 * This file is the grammar and the arithmetic, and it is pure: the per-collection
 * mappers turn a row the Worker returns into a {@link StageDoc}, and {@link layOut}
 * decides where each one stands. The fetching is `recordGather.ts`; the drawing is
 * `RecordStage.tsx`.
 */

import type {
  CaseDisplayRow,
  CfrSectionDisplayRow,
  CommentaryDisplayRow,
  FrDocumentDisplayRow,
  FrusDocumentDisplayRow,
  OlcOpinionDisplayRow,
  PresidentialDocumentDisplayRow,
  UscSectionDisplayRow,
} from '@lawfare/ragtime-client'

/** How a face is drawn. `open` is the honest form of "we do not hold its text, or its length". */
export type Face = 'solid' | 'hatched' | 'open'

/** One document, reduced to what the stage draws and nothing else. */
export type StageDoc = {
  id: string
  title: string
  /** The line under the title: who wrote it, which court, which agency. */
  line: string | null
  /** Its number in its own series: a citation, a docket number, an order number. */
  number: string | null
  /** Where it stands along the floor, in the unit the scene's axis names. Null: the wings. */
  at: number | null
  /** The same, in words, for the label: a date, "Title 50". */
  when: string | null
  /** Length of its text in characters, where the record has one. Drives height. */
  chars: number | null
  /** Length as its own collection counts it — pages, docket entries — for the label. */
  count: number | null
  /** The row it stands in: its kind, in the collection's own terms. Null in a one-row scene. */
  lane: string | null
  face: Face
  /** True when it reached the public some way other than being published: FOIA, an archive. */
  rough: boolean
  /** False while it is still open: a case not terminated, a rule still taking comments. */
  capped: boolean
  /** How poorly its text was read, 0 (clean) to 1. A film over the face. */
  film: number
  /** The collection's own flag for "this one matters": a significant rule. */
  marked: boolean
  /** A key shared by documents that are one proceeding: a rulemaking's RIN. */
  family: string | null
  /** The logical path that opens it. */
  href: string
}

/** What the floor's long axis is. */
export type Axis = { kind: 'time' } | { kind: 'ordinal'; label: string }

/**
 * What each property means *in this collection*. `height`, `along` and `rows` name what a
 * dimension measures; the rest are the phrase for a document that has the property ("released
 * under FOIA, not published"), used in the legend when any document on stage has it and
 * beside the document that does. Sent with the scene, so a legend cannot disagree with the
 * mapper that drew it.
 */
export type Legend = {
  height: string
  along: string
  rows?: string
  hatched?: string
  open?: string
  rough?: string
  uncapped?: string
  film?: string
  marked?: string
  family?: string
}

export type RecordScene = {
  kind: 'record'
  /** The collection's slug and its name. */
  corpus: string
  label: string
  query: string
  /** How many documents matched in all; `docs` is the first of them. */
  total: number
  docs: StageDoc[]
  axis: Axis
  /** The noun `count` counts: "pages", "entries". */
  unit: string | null
  legend: Legend
  /** The search has been asked and has not answered. The floor is up and empty. */
  pending: boolean
}

/** How many are brought on. More than this and the floor is a crowd, not a set. */
export const ON_STAGE = 60

const DAY = 86_400_000

/** A date as days since 1970, or null for anything that is not one. */
export function dayOf(date: string | null | undefined): number | null {
  if (!date) return null
  const ms = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date)
  return Number.isFinite(ms) ? Math.floor(ms / DAY) : null
}

const text = (value: string | null | undefined, otherwise: string) => (value && value.trim() ? value.trim() : otherwise)
const first = (values: string[] | null | undefined) => (values && values.length > 0 ? values[0] : null)

function filmOf(quality: string | null | undefined): number {
  if (quality === 'degraded') return 1
  if (quality === 'normalized' || quality === 'juris_backfill') return 0.5
  return 0
}

/** `executive_order` → "executive order". The collection's own word, made readable, not replaced. */
function words(value: string | null | undefined): string | null {
  return value ? value.replace(/[_-]+/g, ' ') : null
}

// ── One mapper per collection. Each reads only fields its row type declares. ────────────

export function olcDoc(row: OlcOpinionDisplayRow): StageDoc {
  return {
    id: String(row.id),
    title: text(row.title, '(untitled opinion)'),
    line: row.author,
    number: null,
    at: dayOf(row.date_issued),
    when: row.date_issued,
    chars: row.text_length,
    count: row.page_count,
    lane: null,
    face: row.text_length === null && row.page_count === null ? 'open' : 'solid',
    rough: row.source === 'knight-foia',
    capped: true,
    film: filmOf(row.ocr_quality),
    marked: false,
    family: null,
    href: `/corpus/olc/${row.id}`,
  }
}

export function frDoc(row: FrDocumentDisplayRow, today: string): StageDoc {
  return {
    id: String(row.id),
    title: text(row.title, '(untitled document)'),
    line: first(row.agency_names),
    number: row.fr_citation ?? row.document_number,
    at: dayOf(row.publication_date),
    when: row.publication_date,
    chars: row.text_length,
    count: null,
    lane: words(row.doc_type),
    face: row.text_length === null ? 'open' : row.doc_type === 'proposed_rule' ? 'hatched' : 'solid',
    rough: false,
    capped: !(row.comments_close_on !== null && row.comments_close_on >= today),
    film: 0,
    marked: row.significant === true,
    family: first(row.regulation_id_numbers),
    href: `/corpus/fr/${row.id}`,
  }
}

export function presidentialDoc(row: PresidentialDocumentDisplayRow): StageDoc {
  return {
    id: String(row.id),
    title: text(row.title, row.display_citation ?? '(untitled document)'),
    line: row.president_name,
    number: row.display_citation,
    at: dayOf(row.signing_date ?? row.publication_date),
    when: row.signing_date ?? row.publication_date,
    chars: row.text_length,
    count: null,
    lane: words(row.doc_type),
    face: row.text_quality === 'metadata_only' || row.text_length === null ? 'open' : 'solid',
    rough: false,
    capped: true,
    film: filmOf(row.text_quality),
    marked: false,
    family: null,
    href: `/corpus/presidential/${row.id}`,
  }
}

export function caseDoc(row: CaseDisplayRow): StageDoc {
  const appellate = row.court !== null && /^(ca\d+|cadc|cafc)$/.test(row.court)
  return {
    id: String(row.cl_id),
    title: text(row.case_name, '(unnamed case)'),
    line: row.court,
    number: row.docket_number,
    at: dayOf(row.date_filed),
    when: row.date_filed,
    // A docket has no text length. Its length is its entries, and that is its own scale.
    chars: null,
    count: row.entry_count,
    lane: row.court === null ? null : appellate ? 'courts of appeals' : 'district courts',
    face: row.entry_count === null ? 'open' : 'solid',
    rough: false,
    capped: row.date_terminated !== null,
    film: 0,
    marked: false,
    family: null,
    href: `/corpus/litigation/${row.cl_id}`,
  }
}

export function frusDoc(row: FrusDocumentDisplayRow): StageDoc {
  return {
    id: String(row.id),
    title: text(row.title, '(untitled document)'),
    line: row.place_name,
    number: row.volume_id,
    at: dayOf(row.doc_date),
    when: row.doc_date,
    chars: row.text_length,
    count: null,
    lane: row.classification ? row.classification.toLowerCase() : 'no marking',
    face: row.text_length === null ? 'open' : 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: row.volume_id,
    href: `/corpus/frus/${row.id}`,
  }
}

export function uscDoc(row: UscSectionDisplayRow): StageDoc {
  return {
    id: String(row.id),
    title: text(row.heading, row.citation ?? '(untitled section)'),
    line: row.title_name,
    number: row.citation,
    at: row.title_num,
    when: row.title_num === null ? null : `Title ${row.title_num}`,
    chars: row.text_length,
    count: null,
    lane: row.is_positive_law === null ? null : row.is_positive_law ? 'positive law' : 'not positive law',
    face: row.text_length === null ? 'open' : row.status && row.status !== 'active' ? 'hatched' : 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: null,
    href: `/corpus/usc/${row.id}`,
  }
}

export function cfrDoc(row: CfrSectionDisplayRow): StageDoc {
  return {
    id: String(row.id),
    title: text(row.heading, row.citation ?? '(untitled section)'),
    line: row.title_name,
    number: row.citation,
    at: row.title_num,
    when: row.title_num === null ? null : `Title ${row.title_num}`,
    chars: row.text_length,
    count: null,
    lane: null,
    face: row.reserved === true || row.text_length === null ? 'open' : 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: null,
    href: `/corpus/cfr/${row.id}`,
  }
}

export function commentaryDoc(row: CommentaryDisplayRow): StageDoc {
  return {
    id: `${row.publication}:${row.id}`,
    title: text(row.title, '(untitled piece)'),
    line: first(row.authors),
    number: null,
    at: dayOf(row.published_date),
    when: row.published_date,
    chars: row.text_length,
    count: null,
    lane: words(row.publication),
    face: row.text_length === null ? 'open' : 'solid',
    rough: false,
    capped: true,
    film: 0,
    marked: false,
    family: row.series,
    href: row.source_url ?? '/corpus/commentary',
  }
}

// ── Where each one stands ───────────────────────────────────────────────────────────────

/** A document, placed. Every measure is a fraction: of the floor, or of the tallest thing allowed on it. */
export type Placed = {
  doc: StageDoc
  /** 0 (stage left) to 1 (stage right) along the dated part of the floor; null in the wings. */
  x: number | null
  /** 0 (the back wall) to 1 (the front edge). */
  z: number
  /** 0 to 1. */
  height: number
  /** Its place in the entrance, so the nearest row lands last. */
  order: number
}

export type Laid = {
  placed: Placed[]
  /** The rows, back to front, with the band of depth each has. */
  lanes: { name: string | null; from: number; to: number; count: number }[]
  /** The floor's ends, in the axis's unit; null when nothing on it has a place. */
  span: { from: number; to: number } | null
  /** How many stand in the wings. */
  unplaced: number
  /** Lines along the floor between documents that are one proceeding, in order. */
  families: { key: string; ids: string[] }[]
}

/**
 * Length → height, on a scale that does not change from one search to the next: a
 * two-page memo is the same height tonight as tomorrow, and a thousand-page rule towers
 * over it in both. Logarithmic, because the record's lengths run over four orders of
 * magnitude and a linear floor would be one giant and a row of specks.
 *
 * Characters where the record has them. Where it only counts — a docket's entries — the
 * count gets a scale of its own, and the legend says which is in use.
 */
export function heightOf(doc: StageDoc): number {
  const scale = (value: number, low: number, high: number) =>
    Math.min(1, Math.max(0.06, (Math.log(Math.max(value, low)) - Math.log(low)) / (Math.log(high) - Math.log(low))))
  if (doc.chars !== null && doc.chars > 0) return scale(doc.chars, 800, 2_500_000)
  if (doc.count !== null && doc.count > 0) return scale(doc.count, 1, 2_500)
  // Unknown. A fixed, low, hollow thing — not a guess.
  return 0.16
}

/** The least distance two things in one file may stand apart, as a fraction of the floor. */
const GAP = 0.021

/**
 * How many files deep a row is: how many times a thing may step toward the audience to
 * keep clear of its neighbours. A row that has the whole floor to itself is nine deep; a
 * floor of five rows gives each of them three. When a crowded year fills every file, the
 * next thing takes whichever file has been clear the longest — it overlaps, but with the
 * thing furthest from it, and a crowd then reads as a crowd, which it is.
 */
function filesIn(band: number): number {
  return Math.max(2, Math.min(9, Math.round(band * 9)))
}

export function layOut(docs: StageDoc[]): Laid {
  const names: (string | null)[] = []
  for (const doc of docs) if (!names.includes(doc.lane)) names.push(doc.lane)
  // The rows in the order the documents arrive: the collection's own order of kinds.
  const span = (() => {
    const at = docs.map((doc) => doc.at).filter((value): value is number => value !== null)
    if (at.length === 0) return null
    const from = Math.min(...at)
    const to = Math.max(...at)
    // One date is a floor a year wide, with the document in the middle of it.
    return from === to ? { from: from - 183, to: to + 183 } : { from, to }
  })()

  // A row's share of the floor's depth follows how much has to stand in it — by the
  // square root, so one crowded row does not flatten the others to a line, and never
  // less than a floor under which a row cannot be told from a rule.
  const counts = names.map((name) => docs.filter((doc) => doc.lane === name).length)
  const weights = counts.map((count) => Math.max(Math.sqrt(count), 1.6))
  const whole = weights.reduce((sum, weight) => sum + weight, 0) || 1
  let from = 0
  const lanes = names.map((name, index) => {
    const lane = { name, from, to: from + weights[index] / whole, count: counts[index] }
    from = lane.to
    return lane
  })

  const placed: Placed[] = []
  for (const lane of lanes) {
    const mine = docs.filter((doc) => doc.lane === lane.name)
    const dated = mine.filter((doc) => doc.at !== null).sort((a, b) => (a.at as number) - (b.at as number))
    const wings = mine.filter((doc) => doc.at === null)
    // Things too close along the floor step toward the audience instead of being moved
    // along it: where a document stands in time is the one thing here that is not
    // negotiable, and depth inside a row means nothing, so depth is what gives.
    const band = lane.to - lane.from
    const files = filesIn(band)
    const depth = (file: number) => lane.from + band * (0.16 + (0.72 * file) / (files - 1))
    const last: number[] = new Array<number>(files).fill(-1)
    for (const doc of dated) {
      const x = span ? ((doc.at as number) - span.from) / (span.to - span.from) : 0.5
      let file = last.findIndex((taken) => x - taken >= GAP)
      if (file === -1) file = last.indexOf(Math.min(...last))
      last[file] = x
      placed.push({ doc, x, z: depth(file), height: heightOf(doc), order: 0 })
    }
    wings.forEach((doc, index) => {
      placed.push({ doc, x: null, z: depth(index % files), height: heightOf(doc), order: 0 })
    })
  }
  // Back row first, and left to right within it: a set is built from the wall forward.
  placed
    .sort((a, b) => a.z - b.z || (a.x ?? -1) - (b.x ?? -1))
    .forEach((each, index) => {
      each.order = index
    })

  const byFamily = new Map<string, Placed[]>()
  for (const each of placed) {
    if (!each.doc.family || each.x === null) continue
    byFamily.set(each.doc.family, [...(byFamily.get(each.doc.family) ?? []), each])
  }
  const families = [...byFamily.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      key,
      ids: members.sort((a, b) => (a.x as number) - (b.x as number)).map((each) => each.doc.id),
    }))

  return { placed, lanes, span, unplaced: placed.filter((each) => each.x === null).length, families }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The marks along the front of a time floor: whole years, thinned until they fit — or,
 * when the whole floor is less than three years, the first of each month, thinned the
 * same way. A search of this year's filings is a floor a few months long, and a floor
 * with no marks on it is not a time floor to anyone looking at it.
 */
export function yearTicks(span: { from: number; to: number }, most = 12): { x: number; label: string }[] {
  const out: { x: number; label: string }[] = []
  const place = (ms: number, label: string) => {
    const x = (ms / DAY - span.from) / (span.to - span.from)
    if (x >= 0 && x <= 1) out.push({ x, label })
  }
  const start = new Date(span.from * DAY)
  const end = new Date(span.to * DAY)
  const first = start.getUTCFullYear()
  const last = end.getUTCFullYear()
  const months = (last - first) * 12 + end.getUTCMonth() - start.getUTCMonth()
  if (months < 36) {
    const every = [1, 2, 3, 6].find((step) => months / step <= most) ?? 6
    for (let m = Math.ceil(start.getUTCMonth() / every) * every; first * 12 + m <= last * 12 + end.getUTCMonth(); m += every) {
      const year = first + Math.floor(m / 12)
      place(Date.UTC(year, m % 12, 1), `${MONTHS[m % 12]} ${year}`)
    }
    return out
  }
  const every = [1, 2, 5, 10, 20, 25, 50, 100].find((step) => (last - first) / step <= most) ?? 100
  for (let year = Math.ceil(first / every) * every; year <= last; year += every) place(Date.UTC(year, 0, 1), String(year))
  return out
}

/** The marks along an ordinal floor: whole numbers, thinned the same way. */
export function ordinalTicks(span: { from: number; to: number }, most = 14): { x: number; label: string }[] {
  const every = [1, 2, 5, 10].find((step) => (span.to - span.from) / step <= most) ?? 10
  const out: { x: number; label: string }[] = []
  for (let n = Math.ceil(span.from / every) * every; n <= span.to; n += every) {
    out.push({ x: (n - span.from) / (span.to - span.from), label: String(n) })
  }
  return out
}

/** "51 pages", "1,204 entries", "about 12 pages" — the length, in the words the label uses. */
export function lengthSaid(doc: StageDoc, unit: string | null): string | null {
  if (doc.count !== null && unit) return `${doc.count.toLocaleString('en-US')} ${doc.count === 1 ? unit.replace(/s$/, '').replace(/ie$/, 'y') : unit}`
  if (doc.chars !== null) {
    const pages = Math.max(1, Math.round(doc.chars / 3000))
    return `about ${pages.toLocaleString('en-US')} ${pages === 1 ? 'page' : 'pages'} of text`
  }
  return null
}
