/**
 * Non-component helpers for the book catalogue spoke (kept out of the .tsx
 * files so react-refresh sees component-only modules — the fbi-format.ts
 * precedent). Pure: no window, no React, pinned by books-format.test.ts.
 *
 * The rules here are the design's (ragtime-dev
 * `docs/briefs/book-corpus-query-architecture.md`), rendered:
 * - P2, type the null and show the denominator: a count past the Worker's cap
 *   is a floor and reads as one; a filter on a sparse field says how much of
 *   the catalogue carries that field at all.
 * - P3, the handoff ladder, in order: the LOC catalogue entry, free full text
 *   where the work is likely public domain, a library. Google Books sits
 *   beside the ladder, labelled as someone else's index.
 */

import type {
  BookDisplayRow,
  BooksCoverage,
  BooksFacets,
  BooksFilterFields,
} from '@lawfare/ragtime-client'

/** 10,543,015 → '10.5 million'. Whole numbers below a million keep their commas. */
export function formatMillions(n: number): string {
  if (n < 1_000_000) return n.toLocaleString('en-US')
  return `${(Math.round(n / 100_000) / 10).toLocaleString('en-US')} million`
}

/** 'a 2016 snapshot', or 'a snapshot' while the edition is unknown. */
export function snapshotPhrase(vintage: number | undefined): string {
  return vintage != null ? `a ${vintage} snapshot` : 'a snapshot'
}

/**
 * The header disclosure, with the record count and the snapshot year read from
 * the Worker's /facets rather than typed here. Without facets (loading, or the
 * call failed) it says the same things with no figures.
 */
export function booksDisclosure(facets: BooksFacets | undefined): string {
  const records = facets ? `${formatMillions(facets.record_count)} books` : 'books'
  const vintage = facets?.source_vintage
  const since = vintage != null ? ` since ${vintage}` : ' after the snapshot'
  return `Catalogue records for ${records} from the Library of Congress — author, title, publisher, date, length and subject headings. We hold the catalogue, not the books: there is no text to search or quote. The records are LC’s bulk snapshot${vintage != null ? ` of ${vintage}` : ''}, so nothing catalogued${since} is here, and the snapshot is incomplete even for the years it covers.`
}

/** The default no-match text. */
export function booksEmptyHint(vintage: number | undefined): string {
  return `No records matched. That is a fact about this catalogue — ${snapshotPhrase(vintage)} that is incomplete even for its own years — not evidence the book does not exist. Author names must match the catalogue form exactly (Surname, Forename); a subject substring usually finds more than an exact heading.`
}

/** The Worker's id cap; a floor count is exactly this. */
export const BOOKS_COUNT_CAP = 10_000

/**
 * The count line. A floor is "10,000+", never "10,000": the Worker stopped
 * counting there, and a bare number reads like a total of the catalogue.
 */
export function formatBooksCount(count: number, isFloor: boolean): string {
  const n = count.toLocaleString('en-US')
  const noun = count === 1 && !isFloor ? 'record' : 'records'
  return isFloor ? `${n}+ ${noun}` : `${n} ${noun}`
}

/** 406,644 of 10,543,015 → '3.9%'. One decimal under 10%, none above. */
export function coveragePercent(c: BooksCoverage | undefined): string | null {
  if (!c || !c.total) return null
  const pct = (c.present / c.total) * 100
  if (pct >= 99.95) return '100%'
  return (pct < 10 ? pct.toFixed(1) : pct.toFixed(0)) + '%'
}

/**
 * The coverage hint shown on a sparse filter: what share of the catalogue
 * the filter can see. Null when coverage is unknown (facets failed) — the
 * control then shows no number rather than a guessed one.
 */
export function coverageHint(c: BooksCoverage | undefined): string | null {
  const pct = coveragePercent(c)
  // A field on every record has no invisible remainder to warn about.
  if (!pct || !c || c.present >= c.total) return null
  return `coded on ${pct} of records (${c.present.toLocaleString('en-US')} of ${c.total.toLocaleString('en-US')}) — the rest are invisible to this filter`
}

/**
 * MARC name punctuation off, for display only: 'Wittes, Benjamin.' →
 * 'Wittes, Benjamin'. Filtering sends the user's own string; the Worker
 * normalises it the same way the index does.
 */
export function displayName(name: string): string {
  return name.trim().replace(/[\s.,;:]+$/, '')
}

/** 'Cannon, Lou, 1933-2016' keeps its dates; only trailing punctuation goes. */
export function displayAuthors(row: Pick<BookDisplayRow, 'authors'>): string[] {
  return (row.authors ?? []).map(displayName).filter((s) => s !== '')
}

/** Title with subtitle, as the title page reads: MARC's ' /' and ' :' trimmed. */
export function displayTitle(row: Pick<BookDisplayRow, 'title' | 'subtitle'>): string {
  const clean = (s: string | null) => (s ?? '').trim().replace(/[\s/:;,.=]+$/, '')
  const t = clean(row.title)
  const sub = clean(row.subtitle)
  if (!t && !sub) return '(no title)'
  return sub ? `${t || '(no title)'}: ${sub}` : t
}

/** The year to show: the normalised one, else what the record says. */
export function displayYear(row: Pick<BookDisplayRow, 'pub_date' | 'pub_date_normalized'>): string | null {
  if (row.pub_date_normalized != null) return String(row.pub_date_normalized)
  const raw = row.pub_date?.trim().replace(/[.,;]+$/, '')
  return raw || null
}

/**
 * The first usable ISBN. MARC 020 $a often carries a qualifier —
 * '0674030044 (alk. paper)' — and sometimes hyphens; keep the digits (and a
 * final X). Null when nothing on the record is ten or thirteen characters.
 */
export function firstIsbn(row: Pick<BookDisplayRow, 'isbn'>): string | null {
  for (const raw of row.isbn ?? []) {
    const m = raw.replace(/-/g, '').match(/^\s*([0-9]{9}[0-9Xx]|[0-9]{13})\b/)
    if (m) return m[1].toUpperCase()
  }
  return null
}

/** Free-text query for an outside catalogue: title and first author. */
function outsideQuery(row: Pick<BookDisplayRow, 'title' | 'subtitle' | 'authors'>): string {
  const t = displayTitle({ title: row.title, subtitle: null })
  const a = displayAuthors(row)[0]
  return [t === '(no title)' ? '' : t, a ?? ''].filter(Boolean).join(' ')
}

export type Handoff = {
  /** Stable key, also the test's handle. */
  key: 'loc' | 'hathitrust' | 'internet-archive' | 'worldcat' | 'google-books'
  label: string
  href: string
  /** One line on what the reader gets there — and what they don't. */
  note: string
}

/**
 * P3's ladder for one record, in the design's order: the LOC catalogue entry
 * (ours, free, stable), free full text where the work is likely public
 * domain, then a library. Purchase is the design's last rung and is not
 * linked — we do not pick a seller.
 *
 * `likelyPublicDomain` is the Worker's computed flag (a date heuristic, never
 * a legal determination); without it the free-full-text rung is omitted
 * rather than offered for a book that is almost certainly in copyright.
 */
export function handoffLadder(
  row: Pick<BookDisplayRow, 'title' | 'subtitle' | 'authors' | 'isbn' | 'lccn_normalized'>,
  opts: { locPermalink?: string | null; likelyPublicDomain?: boolean },
): Handoff[] {
  const out: Handoff[] = []
  const loc = opts.locPermalink ?? (row.lccn_normalized ? `https://lccn.loc.gov/${row.lccn_normalized}` : null)
  if (loc) {
    out.push({
      key: 'loc',
      label: 'Library of Congress catalogue entry',
      href: loc,
      note: 'The record this one was parsed from, on LC’s live catalogue.',
    })
  }
  const q = outsideQuery(row)
  if (opts.likelyPublicDomain && q) {
    out.push({
      key: 'hathitrust',
      label: 'HathiTrust — full text',
      href: `https://babel.hathitrust.org/cgi/ls?q1=${encodeURIComponent(q)};anyall1=all;lmt=ft`,
      note: 'Likely public domain by date, so a full scan may be free to read. A date heuristic, not a legal determination.',
    })
    out.push({
      key: 'internet-archive',
      label: 'Internet Archive — full text',
      href: `https://archive.org/search?query=${encodeURIComponent(q)}&sin=TXT`,
      note: 'Free scans of older editions, where someone has digitised this one.',
    })
  }
  const isbn = firstIsbn(row)
  const library = isbn
    ? `https://search.worldcat.org/search?q=bn%3A${isbn}`
    : q
      ? `https://search.worldcat.org/search?q=${encodeURIComponent(q)}`
      : null
  if (library) {
    out.push({
      key: 'worldcat',
      label: 'Find it in a library (WorldCat)',
      href: library,
      note: 'Libraries near you that hold this book.',
    })
  }
  return out
}

/**
 * Google Books, beside the ladder rather than on it: someone else's index,
 * rights-limited, and not a source we can replay. An ISBN resolves to the
 * volume; without one it is a search, and the label says so.
 */
export function googleBooksLink(
  row: Pick<BookDisplayRow, 'title' | 'subtitle' | 'authors' | 'isbn'>,
): Handoff | null {
  const isbn = firstIsbn(row)
  if (isbn) {
    return {
      key: 'google-books',
      label: 'Google Books',
      href: `https://books.google.com/books?vid=ISBN${isbn}`,
      note: 'Google’s page for this ISBN. Previews and snippets are Google’s and the rights-holder’s, not ours — a snippet shows a passage exists, nothing more.',
    }
  }
  const q = outsideQuery(row)
  if (!q) return null
  return {
    key: 'google-books',
    label: 'Search Google Books',
    href: `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(q)}`,
    note: 'No ISBN on this record, so this is a title search on Google, not a match. Snippets there are Google’s, not ours.',
  }
}

/**
 * Editions within the fetched rows: work_cluster_key → how many of the rows
 * share it. Only keys with two or more are returned. It is a count over what
 * came back, not over the catalogue, and the key is a heuristic (two authors
 * of the same name with a same-titled book collide), so the UI calls it a
 * hint.
 */
export function editionCounts(
  rows: readonly Pick<BookDisplayRow, 'work_cluster_key'>[],
): Map<string, number> {
  const all = new Map<string, number>()
  for (const r of rows) {
    if (!r.work_cluster_key) continue
    all.set(r.work_cluster_key, (all.get(r.work_cluster_key) ?? 0) + 1)
  }
  for (const [k, n] of all) if (n < 2) all.delete(k)
  return all
}

/** The common MARC language codes, named. Anything else shows its code. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  eng: 'English', ger: 'German', fre: 'French', spa: 'Spanish', ita: 'Italian',
  rus: 'Russian', chi: 'Chinese', jpn: 'Japanese', por: 'Portuguese', heb: 'Hebrew',
  ara: 'Arabic', pol: 'Polish', dut: 'Dutch', kor: 'Korean', lat: 'Latin',
  swe: 'Swedish', cze: 'Czech', hun: 'Hungarian', gre: 'Greek, Modern', tur: 'Turkish',
  yid: 'Yiddish', dan: 'Danish', nor: 'Norwegian', fin: 'Finnish', ukr: 'Ukrainian',
  hin: 'Hindi', per: 'Persian', urd: 'Urdu', vie: 'Vietnamese', rum: 'Romanian',
  scr: 'Croatian', srp: 'Serbian', bul: 'Bulgarian', ind: 'Indonesian', tha: 'Thai',
  ben: 'Bengali', tam: 'Tamil', ice: 'Icelandic', cat: 'Catalan', mul: 'Multiple languages',
  und: 'Undetermined', zxx: 'No linguistic content',
}

export function languageName(code: string | null | undefined): string | null {
  if (!code) return null
  const c = code.trim().toLowerCase()
  return LANGUAGE_NAMES[c] ?? c
}

/** Deep-link facet names this spoke reads, and how each value parses. */
const TEXT_FACETS = [
  'title', 'author', 'subject', 'subjectExact', 'classification', 'classificationPrefix',
  'language', 'originalLanguage', 'uniformTitle', 'series', 'audience', 'lccn', 'isbn',
] as const
const NUMBER_FACETS = ['yearFrom', 'yearTo', 'pagesMin', 'pagesMax'] as const
const BOOLEAN_FACETS = ['illustrated', 'likelyPublicDomain'] as const

/**
 * A workspace deep link (`/corpus/books?q=…&author=…`) → filter fields.
 * Facet names are the Worker's own filter vocabulary, so a link the Explorer
 * writes from a tool call lands on the same filter. Unknown names and
 * unparseable values are dropped, never guessed at. Null when the link
 * carries nothing to filter on.
 */
export function fieldsFromDeepLink(
  q: string | undefined,
  facets: Readonly<Record<string, readonly string[]>>,
): BooksFilterFields | null {
  const f: BooksFilterFields = {}
  if (q && q.trim()) f.search = q.trim()
  for (const name of TEXT_FACETS) {
    const v = facets[name]?.[0]?.trim()
    if (v) f[name] = v
  }
  for (const name of NUMBER_FACETS) {
    const v = Number(facets[name]?.[0])
    if (facets[name]?.[0] && Number.isFinite(v)) f[name] = Math.floor(v)
  }
  for (const name of BOOLEAN_FACETS) {
    if (facets[name]?.[0] === 'true') f[name] = true
  }
  return Object.keys(f).length ? f : null
}

/** A short line naming what a filter asked for, for the usage log and CSV meta. */
export function describeFields(f: BooksFilterFields): string {
  const parts = Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`))
  return parts.length ? parts.join(' · ') : '(no filter)'
}
