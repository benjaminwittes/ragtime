import {
  CORPORA,
  fetchBooksFacets,
  fetchCfrFacets,
  fetchClemencyFacets,
  fetchCommentaryFacets,
  fetchCongressFacets,
  fetchFbiFacets,
  fetchFrusFacets,
  fetchOlcFacets,
  fetchPresidentialFacets,
  fetchSanctionsEntityFacets,
  fetchSanctionsFrFacets,
  fetchSanctionsGuidanceFacets,
  fetchUscFacets,
  type BooksFacets,
  type CfrFacets,
  type ClemencyFacets,
  type CommentaryFacets,
  type CongressFacets,
  type CorpusSlug,
  type FbiFacets,
  type FrusFacets,
  type OlcFacets,
  type PresidentialFacets,
  type SanctionsEntityFacets,
  type SanctionsFrFacets,
  type SanctionsGuidanceFacets,
  type UscFacets,
} from '@lawfare/ragtime-client'
import { numberWord } from '@/lib/number-words'
import { hubKeywordSpokes, spokes } from '@/spokes/registry'
import { BOOKS_COUNT_CAP, coveragePercent } from '@/spokes/books/books-format'

/**
 * Figures for the docs pages.
 *
 * A page that states a count, a date range or a share of a corpus writes a
 * `{{token}}` where the figure goes and this module supplies it: from the same
 * `/facets` routes the spoke headers read, or from the registry for the
 * corpus-count words. Nothing here is typed from memory, so a page cannot be
 * right on the day it is written and wrong a month later.
 *
 * `figures.test.ts` fails a page that carries a bare figure or a token this
 * module does not define. Where a number has no live source, the page drops
 * the number rather than keeping a copy.
 *
 * Modifiers: `{{key|cap}}` capitalises the first letter, for a figure that
 * opens a sentence.
 */

export type Figures = Record<string, string>

const n = (x: number) => x.toLocaleString('en-US')

/** 12,400,000 → '12.4 million'; smaller figures keep their commas. */
const millions = (x: number) =>
  x < 1_000_000
    ? n(x)
    : `${(Math.round(x / 100_000) / 10).toLocaleString('en-US')} million`

const year = (s: string | null | undefined) => (s ? String(s).slice(0, 4) : '—')

const monthYear = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime())
    ? year(s)
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const countOf = (list: { value: string; count: number }[], value: string) =>
  list.find((x) => x.value === value)?.count ?? 0

/**
 * The one figure with no source here: a count of another body's reported
 * actions, which the clemency page sets beside ours. It is a claim about the
 * source, kept in one place so it is not retyped in prose.
 */
const BIDEN_REPORTED_CLEMENCY_ACTIONS = '4,200'

/* ── Pure mappers: facets in, token values out ─────────────────────────── */

export function booksFigures(f: BooksFacets): Figures {
  return {
    'books.records': millions(f.record_count),
    'books.snapshot': f.source_vintage != null ? String(f.source_vintage) : 'its edition year',
    'books.cap': n(BOOKS_COUNT_CAP),
    'books.audience_pct': coveragePercent(f.coverage.audience) ?? '—',
    'books.illustrations_pct': coveragePercent(f.coverage.illustrations) ?? '—',
    'books.page_count_pct': coveragePercent(f.coverage.page_count) ?? '—',
  }
}

export function olcFigures(f: OlcFacets): Figures {
  return {
    'olc.opinions': n(f.opinion_count),
    'olc.doj': n(countOf(f.sources, 'doj-published')),
    'olc.knight': n(countOf(f.sources, 'knight-foia')),
    'olc.since': year(f.earliest),
  }
}

export function uscFigures(f: UscFacets): Figures {
  return { 'usc.titles': n(f.titles.length), 'usc.sections': n(f.section_count) }
}

export function cfrFigures(f: CfrFacets): Figures {
  return { 'cfr.titles': n(f.titles.length), 'cfr.sections': n(f.section_count) }
}

export function frusFigures(f: FrusFacets): Figures {
  return {
    'frus.documents': n(f.document_count),
    'frus.volumes': n(f.volume_count),
    'frus.from': year(f.earliest),
    'frus.to': year(f.latest),
  }
}

export function fbiFigures(f: FbiFacets): Figures {
  return {
    'fbi.documents': n(f.document_count),
    'fbi.collections': n(f.collection_count),
    'fbi.removed': n(countOf(f.provenance, 'wayback-recovered')),
  }
}

export function congressFigures(f: CongressFacets): Figures {
  const total = Object.values(f.collections).reduce((sum, c) => sum + c.count, 0)
  return {
    'congress.documents': millions(total),
    'congress.turns': millions(f.turn_count),
  }
}

export function commentaryFigures(f: CommentaryFacets): Figures {
  const lawfare = f.publications.lawfare
  const ef = f.publications.executive_functions
  return {
    'commentary.lawfare': n(lawfare?.count ?? 0),
    'commentary.lawfare_since': year(lawfare?.earliest),
    'commentary.ef': n(ef?.count ?? 0),
    'commentary.ef_since': monthYear(ef?.earliest),
  }
}

export function sanctionsFigures(
  e: SanctionsEntityFacets,
  g: SanctionsGuidanceFacets,
  fr: SanctionsFrFacets,
): Figures {
  return {
    'sanctions.entities': n(e.entity_count),
    'sanctions.guidance': n(g.document_count),
    'sanctions.undated_guidance': n(g.undated_count),
    'sanctions.fr_actions': n(fr.document_count),
  }
}

export function presidentialFigures(f: PresidentialFacets): Figures {
  const t = (v: string) => n(countOf(f.doc_types, v))
  return {
    'presidential.documents': n(f.document_count),
    'presidential.executive_orders': t('executive_order'),
    'presidential.proclamations': t('proclamation'),
    'presidential.memoranda': t('memorandum'),
    'presidential.determinations': t('determination'),
    'presidential.notices': t('notice'),
    'presidential.since': year(f.earliest),
  }
}

export function clemencyFigures(f: ClemencyFacets): Figures {
  return {
    'clemency.grants': n(f.grant_count),
    'clemency.pardons': n(countOf(f.clemency_types, 'Pardon')),
    'clemency.commutations': n(countOf(f.clemency_types, 'Commutation')),
    'clemency.jan6': n(countOf(f.topics, 'January 6')),
    'clemency.biden': n(countOf(f.presidents, 'Joe Biden')),
    'clemency.biden_reported': BIDEN_REPORTED_CLEMENCY_ACTIONS,
  }
}

/* ── Registry-derived: the corpus-count words ──────────────────────────── */

/**
 * "Eleven corpora", "ten of them primary sources" and the like, read from the
 * registry and the spoke list so the day a corpus lands the pages say so.
 * `held` is the hub's corpora with documents in them (the catalogue is
 * records, not documents); `fan` is what a Search query goes to.
 */
export function corpusCountFigures(): Figures {
  const hubbed = CORPORA.filter((c) => c.hub !== null && c.kind !== 'catalogue')
  const primary = hubbed.filter((c) => c.kind !== 'commentary')
  const fanPrimary = hubKeywordSpokes.filter((s) => {
    const c = CORPORA.find((x) => x.slug === s.slug)
    return c && c.kind !== 'commentary'
  })
  return {
    'corpora.held': numberWord(hubbed.length),
    'corpora.primary': numberWord(primary.length),
    'corpora.fan': numberWord(hubKeywordSpokes.length),
    'corpora.fan_primary': numberWord(fanPrimary.length),
    'corpora.semantic': numberWord(spokes.filter((s) => s.semanticSearch).length),
  }
}

/* ── Live fetch, once per spoke ────────────────────────────────────────── */

const providers: Partial<Record<CorpusSlug, () => Promise<Figures>>> = {
  books: async () => booksFigures(await fetchBooksFacets()),
  olc: async () => olcFigures(await fetchOlcFacets()),
  usc: async () => uscFigures(await fetchUscFacets()),
  cfr: async () => cfrFigures(await fetchCfrFacets()),
  frus: async () => frusFigures(await fetchFrusFacets()),
  fbi: async () => fbiFigures(await fetchFbiFacets()),
  congress: async () => congressFigures(await fetchCongressFacets()),
  commentary: async () => commentaryFigures(await fetchCommentaryFacets()),
  sanctions: async () => {
    const [e, g, fr] = await Promise.all([
      fetchSanctionsEntityFacets(),
      fetchSanctionsGuidanceFacets(),
      fetchSanctionsFrFacets(),
    ])
    return sanctionsFigures(e, g, fr)
  },
  // The clemency page lives inside the Presidential spoke, so both sets load.
  presidential: async () => {
    const [p, c] = await Promise.all([fetchPresidentialFacets(), fetchClemencyFacets()])
    return { ...presidentialFigures(p), ...clemencyFigures(c) }
  },
}

const cache = new Map<CorpusSlug, Promise<Figures>>()

/** Resolves to `{}` for a spoke with no live figures. A failure is not cached. */
export function loadSpokeFigures(slug: CorpusSlug | undefined): Promise<Figures> {
  const provider = slug && providers[slug]
  if (!slug || !provider) return Promise.resolve({})
  let hit = cache.get(slug)
  if (!hit) {
    hit = provider()
    cache.set(slug, hit)
    hit.catch(() => cache.delete(slug))
  }
  return hit
}

/* ── Rendering ─────────────────────────────────────────────────────────── */

export type FigureState = 'ready' | 'loading' | 'failed'

export const FIGURE_TOKEN = /\{\{([\w.]+)(?:\|(cap))?\}\}/g

/**
 * Fill every `{{token}}`. A token with no value reads '…' while its figures
 * load and '—' once they have failed: a page never shows a stale number in
 * their place.
 */
export function resolveFigures(content: string, figures: Figures, state: FigureState): string {
  return content.replace(FIGURE_TOKEN, (_m, key: string, mod?: string) => {
    const v = figures[key]
    if (v === undefined) return state === 'loading' ? '…' : '—'
    return mod === 'cap' ? v.charAt(0).toUpperCase() + v.slice(1) : v
  })
}
