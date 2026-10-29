/**
 * "Save these to Recordbench" on the corpus pages.
 *
 * The button lives in `ResultWindow`, but each list decides whether to offer it
 * and how its rows are named, and that wiring is copied by hand across eleven
 * lists. So this reads the sources, as `SearchedAs.test.tsx` does: every corpus
 * the bench saves hands its rows over, and the ones it cannot save do not.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { citationOf } from '@/lib/recordbench-save'

const SPOKES = fileURLToPath(new URL('..', import.meta.url))
const src = (rel: string) => readFileSync(`${SPOKES}/${rel}`, 'utf8')

/** Each list the bench can save from, and the corpus its rows are saved as. */
const SAVED: [file: string, corpus: string][] = [
  ['usc/UscResultsList.tsx', 'usc'],
  ['cfr/CfrResultsList.tsx', 'cfr'],
  ['olc/OlcResultsList.tsx', 'olc'],
  ['frus/FrusResultsList.tsx', 'frus'],
  ['commentary/CommentaryResultsList.tsx', 'commentary'],
  ['presidential/PresidentialResultsList.tsx', 'presidential'],
  ['presidential/ClemencyResultsList.tsx', 'clemency'],
  ['fr/FrResultsList.tsx', 'fr'],
  ['congress/CongressResultsList.tsx', 'congress'],
  ['fbi/FbiResultsList.tsx', 'fbi'],
  ['sanctions/SanctionsGuidanceResultsList.tsx', 'sanctions'],
]

/**
 * Lists the bench does not save from: a court case is not one document; the book
 * catalogue holds no text; the bench fetches sanctions guidance only; and the
 * legacy Lawfare spoke's ids are not known to be commentary's.
 */
const NOT_SAVED = [
  'components/ResultsList.tsx',
  'books/BooksResultsList.tsx',
  'sanctions/SanctionsEntityResultsList.tsx',
  'lawfare/LawfareResultsList.tsx',
]

/** The save page's reading of an address (recordbench `frontend/src/lib/save.ts`, `RT_REF`). */
const BENCH_RT_REF = /^rt:\/\/([a-z]+)(?::[a-z_]+)?\/(?:[a-z_]+:)?\d{1,12}$/

describe('the corpus pages offer a save where the bench can take one', () => {
  it.each(SAVED)('%s saves its rows as %s, named for the search', (file, corpus) => {
    const s = src(file)
    expect(s).toContain(`save={{ item: (r) => ({ corpus: '${corpus}'`)
    expect(s).toContain('name: searchedFor }}')
  })

  it.each(NOT_SAVED)('%s offers no save', (file) => {
    expect(src(file)).not.toContain('save={{')
  })

  it('a qualified id makes an address the save page reads', () => {
    for (const ref of [
      citationOf({ corpus: 'congress', id: 'laws:9246' }),
      citationOf({ corpus: 'commentary', id: 'executive_functions:12' }),
      citationOf({ corpus: 'sanctions', id: 'guidance:401' }),
      citationOf({ corpus: 'clemency', id: 1234 }),
    ]) {
      expect(ref).toMatch(BENCH_RT_REF)
    }
  })
})
