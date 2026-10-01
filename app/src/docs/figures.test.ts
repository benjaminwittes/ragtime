import { describe, it, expect } from 'vitest'
import type {
  BooksFacets,
  CfrFacets,
  ClemencyFacets,
  CommentaryFacets,
  CongressFacets,
  FbiFacets,
  FrusFacets,
  OlcFacets,
  PresidentialFacets,
  SanctionsEntityFacets,
  SanctionsFrFacets,
  SanctionsGuidanceFacets,
  UscFacets,
} from '@lawfare/ragtime-client'
import { docsEntries } from './registry'
import {
  FIGURE_TOKEN,
  booksFigures,
  cfrFigures,
  clemencyFigures,
  commentaryFigures,
  congressFigures,
  corpusCountFigures,
  fbiFigures,
  frusFigures,
  olcFigures,
  presidentialFigures,
  resolveFigures,
  sanctionsFigures,
  uscFigures,
} from './figures'

// Facet payloads shaped like the Worker's, small enough to read.
const books = {
  record_count: 10_543_015,
  source_vintage: 2016,
  coverage: {
    audience: { present: 406_644, total: 10_543_015 },
    illustrations: { present: 5_300_000, total: 10_543_015 },
    page_count: { present: 9_404_370, total: 10_543_015 },
  },
} as unknown as BooksFacets
const olc = {
  opinion_count: 2151,
  earliest: '1934-03-01',
  sources: [
    { value: 'doj-published', count: 1445 },
    { value: 'knight-foia', count: 706 },
  ],
} as OlcFacets
const presidential = {
  document_count: 12_736,
  earliest: '1940-01-10',
  doc_types: [
    { value: 'executive_order', count: 5918 },
    { value: 'proclamation', count: 4432 },
    { value: 'memorandum', count: 806 },
    { value: 'determination', count: 799 },
    { value: 'notice', count: 781 },
  ],
} as PresidentialFacets
const clemency = {
  grant_count: 7240,
  clemency_types: [
    { value: 'Pardon', count: 5066 },
    { value: 'Commutation', count: 2174 },
  ],
  presidents: [{ value: 'Joe Biden', count: 264 }],
  topics: [{ value: 'January 6', count: 1565 }],
} as ClemencyFacets

const defined: Record<string, string> = {
  ...corpusCountFigures(),
  ...booksFigures(books),
  ...olcFigures(olc),
  ...uscFigures({ section_count: 60_416, titles: new Array(53) } as unknown as UscFacets),
  ...cfrFigures({ section_count: 227_554, titles: new Array(49) } as unknown as CfrFacets),
  ...frusFigures({ document_count: 314_483, volume_count: 694, earliest: '1620', latest: '1991' } as FrusFacets),
  ...fbiFigures({
    document_count: 10_746,
    collection_count: 1755,
    provenance: [{ value: 'wayback-recovered', count: 1627 }],
  } as FbiFacets),
  ...congressFigures({
    collections: { laws: { count: 94_301 }, bills: { count: 1_100_000 } },
    turn_count: 7_000_000,
  } as unknown as CongressFacets),
  ...commentaryFigures({
    publications: {
      lawfare: { count: 22_700, earliest: '2010-01-01' },
      executive_functions: { count: 540, earliest: '2024-12-02' },
    },
  } as unknown as CommentaryFacets),
  ...sanctionsFigures(
    { entity_count: 19_571 } as SanctionsEntityFacets,
    { document_count: 1475, undated_count: 31 } as SanctionsGuidanceFacets,
    { document_count: 4215 } as SanctionsFrFacets,
  ),
  ...presidentialFigures(presidential),
  ...clemencyFigures(clemency),
}

describe('docs figures', () => {
  it('every {{token}} in a docs page is one figures.ts defines', () => {
    const unknown: string[] = []
    for (const e of docsEntries) {
      for (const m of e.content.matchAll(FIGURE_TOKEN)) {
        if (!(m[1] in defined)) unknown.push(`${e.slug}: ${m[1]}`)
      }
    }
    expect(unknown).toEqual([])
  })

  // The point of all this: a page that types a figure is a page that goes
  // stale. A number with no live source is dropped from the page instead.
  it('no page states a bare count, million or percentage', () => {
    const bare = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|K)\b|\b\d+(?:\.\d+)?%|\b\d+,\d{3}\+/
    const hits: string[] = []
    for (const e of docsEntries) {
      const m = e.content.replace(FIGURE_TOKEN, '').match(bare)
      if (m) hits.push(`${e.slug}: ${m[0]}`)
    }
    expect(hits).toEqual([])
  })

  it('formats the figures the pages read', () => {
    expect(defined['books.records']).toBe('10.5 million')
    expect(defined['books.audience_pct']).toBe('3.9%')
    expect(defined['olc.since']).toBe('1934')
    expect(defined['commentary.ef_since']).toBe('December 2024')
    expect(defined['congress.documents']).toBe('1.2 million')
    expect(defined['clemency.jan6']).toBe('1,565')
  })

  it('reads the corpus-count words from the registry', () => {
    expect(corpusCountFigures()).toEqual({
      'corpora.held': 'eleven',
      'corpora.primary': 'ten',
      'corpora.fan': 'ten',
      'corpora.fan_primary': 'nine',
      'corpora.semantic': 'eight',
    })
  })
})

describe('resolveFigures', () => {
  const figures = { 'a.b': 'ten' }
  it('fills a token, and capitalises on |cap', () => {
    expect(resolveFigures('{{a.b}} of {{a.b|cap}}', figures, 'ready')).toBe('ten of Ten')
  })
  it('shows an ellipsis while loading and a dash once failed, never a stale number', () => {
    expect(resolveFigures('{{x.y}}', figures, 'loading')).toBe('…')
    expect(resolveFigures('{{x.y}}', figures, 'failed')).toBe('—')
  })
})
