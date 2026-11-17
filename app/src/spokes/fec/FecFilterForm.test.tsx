/** Facet lists can include null values (IDs with no value): shown, not dropped. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FecFilterForm } from './FecFilterForm'

describe('FecFilterForm facets', () => {
  it('shows a null facet value as "(none)" with its count', () => {
    const html = renderToStaticMarkup(
      <FecFilterForm
        kind="committee"
        onKindChange={() => {}}
        loading={false}
        onSubmit={() => {}}
        facets={{
          kind: 'committee',
          total: 10,
          facets: {
            cycle: [{ value: 2024, count: 10 }],
            party: [
              { value: 'DEM', count: 4 },
              { value: null, count: 6 },
            ],
          },
        }}
      />,
    )
    expect(html).toContain('DEM (Democratic Party) — 4')
    expect(html).toContain('(none) — 6')
    expect(html).toContain('2024 cycle (2023–2024) — 10')
    expect(html).not.toContain('0 cycle')
  })
})
