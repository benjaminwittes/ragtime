/**
 * The "Searched as" line on the corpus pages.
 *
 * Two things: the markup says what the rule said and nothing when it said
 * nothing; and every corpus search box but litigation's is wired to it. The
 * second reads the sources, because the wiring is fifteen call sites copied by
 * hand and a corpus added later will copy a shell that may predate the line.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SearchedAs } from './SearchedAs'

const SPOKES = fileURLToPath(new URL('..', import.meta.url))
const src = (rel: string) => readFileSync(`${SPOKES}/${rel}`, 'utf8')

describe('SearchedAs', () => {
  it('renders the line it is given, in the hub card styling', () => {
    const el = SearchedAs({ line: 'Searched as: habeas corpus' }) as {
      props: { children: string; className: string; 'data-testid': string }
    }
    expect(el.props.children).toBe('Searched as: habeas corpus')
    expect(el.props['data-testid']).toBe('searched-as')
    expect(el.props.className).toContain('font-mono text-[11px] text-muted-foreground')
  })

  it('renders nothing when the rule had nothing to say', () => {
    expect(SearchedAs({ line: null })).toBeNull()
    expect(SearchedAs({ line: undefined })).toBeNull()
  })
})

/** Each search-box call, the setter its reply feeds, and the box's field. */
const CALLS: [file: string, call: string, setter: string, field: string][] = [
  ['usc/UscSpokeShell.tsx', 'runUscFilter', 'setSearchedAs', 'search'],
  ['cfr/CfrSpokeShell.tsx', 'runCfrFilter', 'setSearchedAs', 'search'],
  ['olc/OlcSpokeShell.tsx', 'runOlcFilter', 'setSearchedAs', 'search'],
  ['frus/FrusSpokeShell.tsx', 'runFrusFilter', 'setSearchedAs', 'search'],
  ['lawfare/LawfareSpokeShell.tsx', 'runLawfareFilter', 'setSearchedAs', 'q'],
  ['commentary/CommentarySpokeShell.tsx', 'runCommentaryFilter', 'setSearchedAs', 'search'],
  ['presidential/PresidentialSpokeShell.tsx', 'runPresidentialFilter', 'setSearchedAs', 'search'],
  ['presidential/ClemencySurface.tsx', 'runClemencyFilter', 'setSearchedAs', 'search'],
  ['fr/FrSpokeShell.tsx', 'runFrFilter', 'setSearchedAs', 'search'],
  ['congress/CongressSpokeShell.tsx', 'runCongressFilter', 'setSearchedAs', 'search'],
  ['congress/TurnsSurface.tsx', 'runCongressTurns', 'setSearchedAs', 'search'],
  ['fbi/FbiSpokeShell.tsx', 'runFbiFilter', 'setSearchedAs', 'search'],
  ['books/BooksSpokeShell.tsx', 'runBooksFilter', 'setSearchedAs', 'search'],
  ['sanctions/SanctionsSpokeShell.tsx', 'runSanctionsEntityFilter', 'setEntitySearchedAs', 'search'],
  ['sanctions/SanctionsSpokeShell.tsx', 'runSanctionsGuidanceFilter', 'setGuidanceSearchedAs', 'search'],
  ['sanctions/SanctionsSpokeShell.tsx', 'runSanctionsFrFilter', 'setFrSearchedAs', 'search'],
]

const LISTS = [
  'usc/UscResultsList.tsx',
  'cfr/CfrResultsList.tsx',
  'olc/OlcResultsList.tsx',
  'frus/FrusResultsList.tsx',
  'lawfare/LawfareResultsList.tsx',
  'commentary/CommentaryResultsList.tsx',
  'presidential/PresidentialResultsList.tsx',
  'presidential/ClemencyResultsList.tsx',
  'fr/FrResultsList.tsx',
  'congress/CongressResultsList.tsx',
  'fbi/FbiResultsList.tsx',
  'books/BooksResultsList.tsx',
  'sanctions/SanctionsEntityResultsList.tsx',
  'sanctions/SanctionsGuidanceResultsList.tsx',
]

describe('every corpus search box but litigation reports its reading', () => {
  it.each(CALLS)('%s: %s feeds %s from fields.%s', (file, call, setter, field) => {
    const re = new RegExp(
      `await ${call}\\(fields\\)\\n\\s*${setter}\\(searchBoxLine\\(fields\\.${field}, r\\)\\)`,
    )
    expect(src(file)).toMatch(re)
  })

  it.each(LISTS)('%s shows the line under the count and under a no-match message', (file) => {
    const s = src(file)
    expect(s).toMatch(/<ResultWindow\s+searchedAs=\{searchedAs\}/)
    expect(s).toContain('<SearchedAs line={searchedAs} centered />')
  })

  it('litigation stays as it was: its box reports no reading', () => {
    expect(src('SpokeShell.tsx')).not.toContain('searchBoxLine')
    expect(src('components/ResultsList.tsx')).not.toContain('searchedAs')
  })
})
