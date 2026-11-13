/**
 * A corpus search box that finds nothing shows hybrid search's closest
 * matches, and says so (lib/box-fallback.ts).
 *
 * Three things: the shared component's markup; two corpora's empty branches,
 * rendered; and the wiring in every covered corpus, read from the sources the
 * way SearchedAs.test.tsx reads them, because it is twelve call sites copied
 * by hand.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BoxFallback, SemanticSearchRow } from '@lawfare/ragtime-client'

import { FALLBACK_NOTICE, type BoxFallbackView } from '@/lib/box-fallback'
import { FrResultsList } from '../fr/FrResultsList'
import { OlcResultsList } from '../olc/OlcResultsList'
import { FallbackResults } from './FallbackResults'

const SPOKES = fileURLToPath(new URL('..', import.meta.url))
const src = (rel: string) => readFileSync(`${SPOKES}/${rel}`, 'utf8')

const ROW: SemanticSearchRow = {
  id: '42',
  title: 'Presidential war powers memorandum',
  context: 'OLC',
  date: '1980-02-12',
  matched: 'semantic',
  score: 0.03,
  similarity: 0.71,
  snippet: 'The President may direct the armed forces',
}
const reply = (over: Partial<BoxFallback> = {}): BoxFallback => ({
  mode: 'hybrid',
  because: 'no_keyword_match',
  results: [ROW],
  ...over,
})
const view = (r: BoxFallback | undefined): BoxFallbackView => ({ reply: r, onOpen: () => {} })

const NOTICE_HTML = FALLBACK_NOTICE

describe('FallbackResults', () => {
  it('shows the notice, the Searched as line and the hybrid results', () => {
    const html = renderToStaticMarkup(
      <FallbackResults fallback={view(reply())} searchedAs="Searched as: war powers" />,
    )
    expect(html).toContain('data-testid="box-fallback"')
    expect(html).toContain(NOTICE_HTML)
    expect(html).toContain('Searched as: war powers')
    expect(html).toContain('Presidential war powers memorandum')
    expect(html).toContain('71% similar')
  })

  it('renders nothing without results, or when hybrid search failed', () => {
    expect(renderToStaticMarkup(<FallbackResults fallback={view(undefined)} />)).toBe('')
    expect(renderToStaticMarkup(<FallbackResults fallback={view(reply({ results: [] }))} />)).toBe('')
    expect(
      renderToStaticMarkup(<FallbackResults fallback={view(reply({ results: [], error: 'hybrid search 429' }))} />),
    ).toBe('')
  })

  it('says in plain words that these are not keyword matches', () => {
    expect(FALLBACK_NOTICE).toMatch(/^No document holds every word of your search\./)
    expect(FALLBACK_NOTICE).not.toMatch(/\bAI\b|semantic|embedding|vector/i)
  })
})

/** The empty keyword pane, as a corpus renders it. */
const fr = (fallback?: BoxFallbackView) =>
  renderToStaticMarkup(
    <FrResultsList
      rows={[]}
      count={0}
      loading={false}
      error={undefined}
      hasRun
      searchedAs="Searched as: blocked persons"
      executedSql={undefined}
      onOpenDocument={() => {}}
      fallback={fallback}
    />,
  )
const olc = (fallback?: BoxFallbackView) =>
  renderToStaticMarkup(
    <OlcResultsList
      rows={[]}
      count={0}
      loading={false}
      error={undefined}
      hasRun
      searchedAs="Searched as: war powers"
      executedSql={undefined}
      onOpenOpinion={() => {}}
      fallback={fallback}
    />,
  )

describe.each([
  ['Federal Register', fr, 'No documents matched.'],
  ['OLC', olc, 'No opinions matched'],
])('%s empty branch', (_name, render, noMatch) => {
  it('shows hybrid results under the notice when the reply carries them', () => {
    const html = render(view(reply()))
    expect(html).toContain(NOTICE_HTML)
    expect(html).toContain('Presidential war powers memorandum')
    expect(html).toContain('Searched as:')
    expect(html).not.toContain(noMatch)
  })

  it('keeps today’s empty state without a fallback, with none found, or on an error', () => {
    for (const f of [undefined, view(undefined), view(reply({ results: [] })), view(reply({ results: [], error: 'x' }))]) {
      const html = render(f)
      expect(html).toContain(noMatch)
      expect(html).not.toContain(NOTICE_HTML)
      expect(html).toContain('data-testid="searched-as"')
    }
  })
})

/** Each covered search box: its shell, the call, and the results list. */
const WIRED: [shell: string, call: string, list: string][] = [
  ['usc/UscSpokeShell.tsx', 'runUscFilter', 'usc/UscResultsList.tsx'],
  ['cfr/CfrSpokeShell.tsx', 'runCfrFilter', 'cfr/CfrResultsList.tsx'],
  ['olc/OlcSpokeShell.tsx', 'runOlcFilter', 'olc/OlcResultsList.tsx'],
  ['frus/FrusSpokeShell.tsx', 'runFrusFilter', 'frus/FrusResultsList.tsx'],
  ['lawfare/LawfareSpokeShell.tsx', 'runLawfareFilter', 'lawfare/LawfareResultsList.tsx'],
  ['commentary/CommentarySpokeShell.tsx', 'runCommentaryFilter', 'commentary/CommentaryResultsList.tsx'],
  ['presidential/PresidentialSpokeShell.tsx', 'runPresidentialFilter', 'presidential/PresidentialResultsList.tsx'],
  ['presidential/ClemencySurface.tsx', 'runClemencyFilter', 'presidential/ClemencyResultsList.tsx'],
  ['fr/FrSpokeShell.tsx', 'runFrFilter', 'fr/FrResultsList.tsx'],
  ['congress/CongressSpokeShell.tsx', 'runCongressFilter', 'congress/CongressResultsList.tsx'],
  ['fbi/FbiSpokeShell.tsx', 'runFbiFilter', 'fbi/FbiResultsList.tsx'],
  ['eac/EacSpokeShell.tsx', 'runEacFilter', 'eac/EacResultsList.tsx'],
  ['sanctions/SanctionsSpokeShell.tsx', 'runSanctionsGuidanceFilter', 'sanctions/SanctionsGuidanceResultsList.tsx'],
]

describe('every corpus search box with search by meaning asks for the fallback', () => {
  it.each(WIRED)('%s: %s asks, keeps the reply, and hands it to the list', (shell, call) => {
    const s = src(shell)
    expect(s).toContain(`await ${call}(fields, BOX_SEARCH)`)
    expect(s).toMatch(/set(Box|Guidance)Fallback\(r\.fallback\)/)
    expect(s).toMatch(/fallback=\{\{ reply: (boxFallback|guidanceFallback), onOpen: \w+ \}\}/)
  })

  it.each(WIRED)('%s: its list shows the fallback in its empty branch', (_shell, _call, list) => {
    expect(src(list)).toMatch(
      /if \(!rows \|\| rows\.length === 0\) \{\n\s*if \(showsFallback\(fallback\)\) return <FallbackResults fallback=\{fallback\} searchedAs=\{searchedAs\} \/>/,
    )
  })

  it('litigation, books and the sanctions entity and Federal Register forms do not ask', () => {
    expect(src('SpokeShell.tsx')).not.toContain('BOX_SEARCH')
    expect(src('books/BooksSpokeShell.tsx')).not.toContain('BOX_SEARCH')
    const sanctions = src('sanctions/SanctionsSpokeShell.tsx')
    expect(sanctions).toContain('await runSanctionsEntityFilter(fields)')
    expect(sanctions).toContain('await runSanctionsFrFilter(fields)')
  })
})
