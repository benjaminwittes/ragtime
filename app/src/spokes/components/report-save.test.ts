/**
 * "Save this report and its sources to Recordbench" on the AI search's report.
 *
 * Each corpus's report names what it cites its own way, and the button hands the bench
 * the same addresses the corpus's list button does. The wiring is copied by hand across
 * the corpus pages, so this reads the sources as well, the way `SaveToRecordbench.test.ts`
 * does. The home page writes no report of its own: its AI arm is the Explorer, whose
 * report already offers the save.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { citationOf, saveMessage } from '@/lib/recordbench-save'
import { bareCited, commentaryCited, congressCited, sanctionsCited } from './report-save'

const SRC = fileURLToPath(new URL('../..', import.meta.url))
const src = (rel: string) => readFileSync(`${SRC}/${rel}`, 'utf8')

/** The save page's reading of an address (recordbench `frontend/src/lib/save.ts`, `RT_REF`). */
const BENCH_RT_REF = /^rt:\/\/([a-z]+)(?::[a-z_]+)?\/(?:[a-z_]+:)?\d{1,12}$/

describe('a report names what it cites as the bench reads it', () => {
  it('a bare-id corpus keeps its ids', () => {
    expect(bareCited('olc', [867, 1117]).map(citationOf)).toEqual(['rt://olc/867', 'rt://olc/1117'])
    expect(bareCited('usc', null)).toEqual([])
  })

  it('congress qualifies a bare id by the collection the question was scoped to', () => {
    expect(congressCited(['bills:75567', 24480, '9246'], 'hearings').map(citationOf)).toEqual([
      'rt://congress/bills:75567',
      'rt://congress/hearings:24480',
      'rt://congress/hearings:9246',
    ])
  })

  it('congress leaves out a bare id with no scope', () => {
    expect(congressCited([24480, 'laws:7823'], null).map(citationOf)).toEqual(['rt://congress/laws:7823'])
  })

  it('commentary names each piece with its publication', () => {
    expect(
      commentaryCited([
        { publication: 'lawfare', id: 824 },
        { publication: 'executive_functions', id: 12 },
      ]).map(citationOf),
    ).toEqual(['rt://commentary/lawfare:824', 'rt://commentary/executive_functions:12'])
  })

  it('sanctions hands over the guidance a prose report cites, and nothing else', () => {
    const prose = { branch: 'prose', answer_markdown: 'x', source_ids: ['guidance:401', 'fr:77', '12'], candor_notes: [] } as const
    expect(sanctionsCited(prose).map(citationOf)).toEqual(['rt://sanctions/guidance:401', 'rt://sanctions/guidance:12'])
    const entity = { branch: 'entity', answer_markdown: 'x', entity_ids: [5], candor_notes: [], output_mode: 'list', query_summary: [], data_as_of: null } as const
    expect(sanctionsCited(entity)).toEqual([])
  })

  it('every address made reads on the save page', () => {
    for (const item of [
      ...congressCited(['bills:75567', 3], 'laws'),
      ...commentaryCited([{ publication: 'lawfare', id: 1 }]),
      ...sanctionsCited({ branch: 'prose', answer_markdown: 'x', source_ids: ['guidance:4'], candor_notes: [] }),
      ...bareCited('frus', [99]),
    ]) {
      expect(citationOf(item)).toMatch(BENCH_RT_REF)
    }
  })

  it('a report that cites nothing offers no save', () => {
    expect(saveMessage('report', bareCited('fbi', []), 'q', 'words')).toBeNull()
  })
})

/** Each corpus page whose AI search report offers the save, and how it names what it cites. */
const REPORTS: [file: string, cited: string][] = [
  ['spokes/usc/UscSpokeShell.tsx', "bareCited('usc', amaSynthesis.section_ids)"],
  ['spokes/cfr/CfrSpokeShell.tsx', "bareCited('cfr', amaSynthesis.section_ids)"],
  ['spokes/olc/OlcSpokeShell.tsx', "bareCited('olc', amaSynthesis.opinion_ids)"],
  ['spokes/frus/FrusSpokeShell.tsx', "bareCited('frus', amaSynthesis.document_ids)"],
  ['spokes/presidential/PresidentialSpokeShell.tsx', "bareCited('presidential', amaSynthesis.document_ids)"],
  ['spokes/fr/FrSpokeShell.tsx', "bareCited('fr', amaSynthesis.document_ids)"],
  ['spokes/fbi/FbiSpokeShell.tsx', "bareCited('fbi', amaSynthesis.document_ids)"],
  ['spokes/congress/CongressSpokeShell.tsx', 'congressCited(amaSynthesis.document_ids, amaScopeCollection)'],
  ['spokes/commentary/CommentarySpokeShell.tsx', 'commentaryCited(amaSynthesis.cited)'],
  ['spokes/sanctions/SanctionsSpokeShell.tsx', 'sanctionsCited(amaSynthesis)'],
]

describe('the AI search report offers a save where the bench can take one', () => {
  it.each(REPORTS)('%s saves its report with what it cites', (file, cited) => {
    const s = src(file)
    expect(s).toContain('outcome="report"')
    expect(s).toContain(cited)
    expect(s).toContain('name={amaQuestion}')
    expect(s).toContain('report={amaSynthesis.answer_markdown}')
  })

  it('the legacy Lawfare spoke offers no save', () => {
    expect(src('spokes/lawfare/LawfareSpokeShell.tsx')).not.toContain('outcome="report"')
  })
})
