/**
 * The section sheet's flags, rendered: status first for anything not in
 * force, the section a rule moved to, the temporary-text marker, the date the
 * law is reflected through, history and notes.
 *
 * The sheet's Radix parts need a Dialog around them, so the view is rendered
 * inside a mocked sheet module (plain elements) with renderToStaticMarkup, as
 * the EAC sheet test does. The Worker is not called: the view is a pure
 * function of the reply it is handed.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  StateCodeSectionDetail,
  StateCodeSectionDisplayRow,
} from '@lawfare/ragtime-client'

vi.mock('@/components/ui/sheet', () => ({
  SheetHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const { StateCodeSectionView } = await import('./StateCodeSectionDetailSheet')

const inForceRow: StateCodeSectionDisplayRow = {
  member: 'dc',
  id: 4402,
  citation: 'D.C. Code § 22-1307',
  section_identifier: '22-1307',
  heading: 'Crowding, obstructing, or incommoding.',
  title_num: '22',
  title_name: 'Criminal Offenses and Penalties.',
  chapter: 'Chapter 13. Disorderly Conduct.',
  status: 'in_force',
  recodified_to: null,
  has_temporary_text: false,
  applicable_on: null,
  codified_date: '2026-11-03',
  text_length: 900,
}

const detail = (over: Partial<StateCodeSectionDetail> = {}): StateCodeSectionDetail => ({
  ...inForceRow,
  subchapter: null,
  part: null,
  structure_path: null,
  text_content: 'It is unlawful for a person, alone or in concert with others, to crowd …',
  source_credit: null,
  notes: 'Prior Codifications. 1981 Ed., § 22-1121.',
  history: [
    { doc: 'D.C. Law 19-317', eff: '2013-06-11', app: null, path: '§2(a)', target_path: null, text: null },
  ],
  source_reason: null,
  build_date: '2026-11-04',
  ...over,
})

const render = (
  d: StateCodeSectionDetail | null,
  opts: { row?: StateCodeSectionDisplayRow; loading?: boolean; error?: string | null } = {},
) =>
  renderToStaticMarkup(
    <StateCodeSectionView
      target={{ ref: { member: 'dc', id: 4402 }, row: opts.row ?? inForceRow }}
      detail={d}
      loading={opts.loading ?? false}
      error={opts.error ?? null}
      onOpenSection={() => {}}
    />,
  )

describe('StateCodeSectionView — a section in force', () => {
  it('shows text, history, notes and the date the law is reflected through, with no status band', () => {
    const html = render(detail())
    expect(html).toContain('D.C. Code § 22-1307')
    expect(html).toContain('It is unlawful for a person')
    expect(html).toContain('D.C. Law 19-317')
    expect(html).toContain('2013-06-11')
    expect(html).toContain('Prior Codifications')
    expect(html).toContain('Law reflected through 2026-11-03')
    expect(html).toContain('District of Columbia')
    expect(html).not.toContain('data-testid="status-band"')
    expect(html).not.toContain('data-status=')
  })

  it('keeps unit names as the code writes them, tags included', () => {
    const html = render(detail({ title_name: 'Taxation, Licensing, Permits, Assessments, and Fees. [Enacted title]' }))
    expect(html).toContain('[Enacted title]')
  })

  it('shows the credit line when there is no structured history', () => {
    const html = render(detail({ history: [], source_credit: '(Dec. 1, 1982, D.C. Law 4-164, § 1)' }))
    expect(html).toContain('D.C. Law 4-164')
  })
})

describe('StateCodeSectionView — sections not in force', () => {
  it('flags a repealed section above its text, with the code’s own words', () => {
    const html = render(detail({ status: 'repealed', source_reason: 'Repealed by D.C. Law 7-105' }))
    expect(html).toContain('data-testid="status-band"')
    expect(html).toContain('data-status="repealed"')
    expect(html).toContain('It is not in force.')
    expect(html).toContain('Repealed by D.C. Law 7-105')
    expect(html.indexOf('status-band')).toBeLessThan(html.indexOf('Section text'))
  })

  it('names and links the section a recodified rule moved to', () => {
    const html = render(detail({ status: 'recodified', recodified_to: '22-1321', text_content: 'Recodified as § 22-1321.' }))
    expect(html).toContain('Recodified')
    expect(html).toContain('Its rule now sits at')
    expect(html).toMatch(/<button[^>]*>D\.C\. Code § 22-1321<\/button>/)
  })

  it('gives the start date of a section not yet applicable', () => {
    const html = render(detail({ status: 'not_yet_applicable', applicable_on: '2027-01-01' }))
    expect(html).toContain('Applies from 2027-01-01')
    expect(html).toContain('Until then it is not in force')
  })

  it('flags an unknown status rather than showing the section as in force', () => {
    const html = render(detail({ status: 'something_new' }))
    expect(html).toContain('data-testid="status-band"')
    expect(html).toContain('not shown as in force')
  })

  it('shows the status band from the list row while the section loads', () => {
    const html = render(null, { row: { ...inForceRow, status: 'expired' }, loading: true })
    expect(html).toContain('data-testid="status-band"')
    expect(html).toContain('Expired')
    expect(html).toContain('Loading section')
  })
})

describe('StateCodeSectionView — temporary text and errors', () => {
  it('marks a section whose current text includes temporary law', () => {
    const html = render(detail({ has_temporary_text: true }))
    expect(html).toContain('temporary text')
    expect(html).toContain('data-testid="temporary-band"')
    expect(html).toContain('emergency or temporary legislation')
  })

  it('shows the error and no text when the section fails to load', () => {
    const html = render(null, { error: 'network down' })
    expect(html).toContain('could not be loaded: network down')
    expect(html).not.toContain('Section text')
  })
})
