/**
 * The one part of the trail that is not a rendering detail: what it does with a
 * `detail` it cannot read.
 *
 * `ToolDetail` takes no hooks, so it can be called as a plain function and asserted on
 * without a DOM — which is also how it catches what it catches. The markup around it stays untested
 * here, in keeping with the rest of `src/` (vitest.config.ts: "unit tests for the app's
 * pure logic").
 */

import { describe, expect, it } from 'vitest'
import type { ExplorerToolDetail } from '@lawfare/ragtime-client'

import { ToolDetail } from './tool-detail.tsx'

/** The text of a returned element tree, which is all these assertions need. */
function text(node: unknown): string {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  const el = node as { props?: { children?: unknown } }
  return el.props ? text(el.props.children) : ''
}

describe('ToolDetail', () => {
  it('renders a detail it knows', () => {
    const detail: ExplorerToolDetail = { kind: 'answer', chars: 3140, citations: 9, candor: 0, cost_cents: 3.1 }
    expect(text(ToolDetail({ detail, summary: 'a summary nobody should see here' }))).toContain('3,140 characters')
  })

  it('falls back to the summary when the detail is one this build has never heard of', () => {
    // A worker ahead of this build. The stream parser tolerates additive deviation by
    // design, so this arrives rather than being filtered out — and before the guard it
    // landed in the `default:` branch, read `chars` off a detail that has none, and took
    // the page down as soon as a reader opened the trail.
    const detail = { kind: 'timeline', events: 4 } as unknown as ExplorerToolDetail
    expect(text(ToolDetail({ detail, summary: 'olc 14 · litigation 3' }))).toBe('olc 14 · litigation 3')
  })

  it('falls back to the summary when a known kind arrives malformed', () => {
    // Same class, different cause: the kind is one we know and the field it needs is gone.
    const detail = { kind: 'search' } as unknown as ExplorerToolDetail
    expect(text(ToolDetail({ detail, summary: '17 hits' }))).toBe('17 hits')
  })
})
