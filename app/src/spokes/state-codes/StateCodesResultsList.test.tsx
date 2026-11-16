/**
 * The results flags, rendered: every row not in force carries its status
 * badge (in the keyword table, the meaning pane and the hybrid fallback), and
 * the not-in-force line says what the match holds or what was hidden.
 * Fixtures stand in for the Worker's replies; nothing calls it.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BoxFallback, SemanticSearchRow, StateCodeSectionDisplayRow } from '@lawfare/ragtime-client'
import { NotInForceLine, StateCodeSectionRowsTable, StateCodesResultsList } from './StateCodesResultsList'
import { StateCodesSemanticResults } from './StateCodesSemanticResults'

const row = (over: Partial<StateCodeSectionDisplayRow>): StateCodeSectionDisplayRow => ({
  member: 'dc',
  id: 1,
  citation: 'D.C. Code § 22-1307',
  section_identifier: '22-1307',
  heading: 'Crowding, obstructing, or incommoding.',
  title_num: '22',
  title_name: 'Criminal Offenses and Penalties.',
  chapter: null,
  status: 'in_force',
  recodified_to: null,
  has_temporary_text: false,
  applicable_on: null,
  codified_date: '2026-11-03',
  text_length: 100,
  ...over,
})

const ROWS = [
  row({ id: 1 }),
  row({ id: 2, citation: 'D.C. Code § 22-1315', status: 'repealed' }),
  row({ id: 3, citation: 'D.C. Code § 5-331.05', status: 'recodified', recodified_to: '5-331.07' }),
  row({ id: 4, citation: 'D.C. Code § 1-1001.16', has_temporary_text: true }),
]

describe('StateCodeSectionRowsTable', () => {
  const html = renderToStaticMarkup(<StateCodeSectionRowsTable rows={ROWS} onOpenSection={() => {}} />)

  it('badges each section not in force, and no section in force', () => {
    expect(html).toContain('data-status="repealed"')
    expect(html).toContain('data-status="recodified"')
    expect(html.match(/data-status=/g)).toHaveLength(2)
  })

  it('names where a recodified rule now sits', () => {
    expect(html).toContain('Rule now at § 5-331.07')
  })

  it('marks temporary text and shows the date the law is reflected through', () => {
    expect(html).toContain('temporary text')
    expect(html).toContain('2026-11-03')
  })
})

describe('NotInForceLine', () => {
  it('says how many matching sections are not in force, and offers to hide them', () => {
    const html = renderToStaticMarkup(
      <NotInForceLine statusCounts={{ in_force: 9, repealed: 2, expired: 1 }} inForceOnly={false} onSetInForceOnly={() => {}} />,
    )
    expect(html).toContain('3 of these sections are not')
    expect(html).toContain('2 repealed and 1 expired')
    expect(html).toContain('Hide them')
  })

  it('says how many were hidden, and offers to show them', () => {
    const html = renderToStaticMarkup(
      <NotInForceLine statusCounts={{ in_force: 9, repealed: 2 }} inForceOnly onSetInForceOnly={() => {}} />,
    )
    expect(html).toContain('Hidden: 2 matching sections not in force')
    expect(html).toContain('Show them')
  })

  it('says nothing when every match is in force', () => {
    expect(renderToStaticMarkup(<NotInForceLine statusCounts={{ in_force: 9 }} inForceOnly={false} />)).toBe('')
  })
})

const semantic = (over: Partial<SemanticSearchRow>): SemanticSearchRow => ({
  id: '7',
  title: 'D.C. Code § 7-2304',
  context: 'Emergency executive order.',
  date: '2026-11-03',
  matched: 'semantic',
  score: 0.7,
  similarity: 0.7,
  snippet: null,
  ...over,
})

describe('the meaning pane and the fallback keep the flags', () => {
  it('badges a semantic result not in force, and one with no status', () => {
    const html = renderToStaticMarkup(
      <StateCodesSemanticResults
        rows={[semantic({ status: 'expired' }), semantic({ id: '8' })]}
        member="dc"
        loading={false}
        error={undefined}
        hasRun
        onOpenSection={() => {}}
      />,
    )
    expect(html).toContain('data-status="expired"')
    expect(html).toContain('Status unknown')
  })

  it('shows the hybrid fallback in the section table, flags included', () => {
    const reply: BoxFallback = {
      mode: 'hybrid',
      because: 'no_keyword_match',
      results: [semantic({ status: 'repealed', recodified_to: '7-2306' })],
    }
    const html = renderToStaticMarkup(
      <StateCodesResultsList
        member="dc"
        rows={[]}
        count={0}
        loading={false}
        error={undefined}
        hasRun
        executedSql={undefined}
        inForceOnly={false}
        onOpenSection={() => {}}
        fallback={{ reply, onOpen: () => {} }}
      />,
    )
    expect(html).toContain('data-testid="box-fallback"')
    expect(html).toContain('data-status="repealed"')
    expect(html).toContain('Rule now at § 7-2306')
  })

  it('says what was hidden even when nothing in force matched', () => {
    const html = renderToStaticMarkup(
      <StateCodesResultsList
        member="dc"
        rows={[]}
        count={0}
        loading={false}
        error={undefined}
        hasRun
        executedSql={undefined}
        statusCounts={{ repealed: 4 }}
        inForceOnly
        onOpenSection={() => {}}
      />,
    )
    expect(html).toContain('Hidden: 4 matching sections not in force')
    expect(html).toContain('No sections matched')
  })
})
