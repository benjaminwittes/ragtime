import { describe, expect, it } from 'vitest'
import { fetchRegistry } from '@lawfare/ragtime-client'
import { spokes } from './registry'

/**
 * Drift guard: the app's spoke list against the Worker's corpus registry.
 *
 * `ragtime-worker/worker/registry.js` is the one source of truth for which
 * corpora exist. The Worker, the MCP connector and the Explorer all read it.
 * The hub does not: `spokes/registry.ts` is a hand-kept list, so a corpus
 * added to the Worker does not appear on the hub until someone adds a spoke,
 * and nothing said so. (The book catalogue shipped that way.) This test says so.
 *
 * It reads the live registry because the Worker deploys on its own, so a
 * checked-in copy would only drift the same way. A network or Worker failure
 * skips the test rather than failing the build: an outage is not drift.
 */

/**
 * Registry corpora that deliberately have no spoke of their own. Each entry
 * carries the reason, so adding one is a decision somebody can read.
 */
const HOSTED_ELSEWHERE: Record<string, string> = {
  clemency: 'presidential acts; shown inside the Presidential Documents spoke (see App.tsx routing)',
  lawfare: "kept in the client's slug union for old types only; the live spoke for this material is commentary",
}

async function liveSlugs(): Promise<string[] | null> {
  try {
    const r = await fetchRegistry({ signal: AbortSignal.timeout(15_000) })
    return r.corpora.map((c) => c.slug)
  } catch {
    return null
  }
}

describe('spoke list against the Worker corpus registry', () => {
  it('has a spoke for every registry corpus, or a stated reason it has none', async (ctx) => {
    const slugs = await liveSlugs()
    if (!slugs) return ctx.skip()
    const have = new Set<string>(spokes.map((s) => s.slug))
    const missing = slugs.filter((s) => !have.has(s) && !(s in HOSTED_ELSEWHERE))
    expect(
      missing,
      `registry corpora with no spoke: ${missing.join(', ')}. Add a spoke in spokes/registry.ts, or list the slug in HOSTED_ELSEWHERE with a reason.`,
    ).toEqual([])
  })

  it('has no spoke for a corpus the registry does not list', async (ctx) => {
    const slugs = await liveSlugs()
    if (!slugs) return ctx.skip()
    const known = new Set(slugs)
    const orphans = spokes.map((s) => s.slug as string).filter((s) => !known.has(s))
    expect(orphans, `spokes with no registry corpus: ${orphans.join(', ')}`).toEqual([])
  })

  it('does not keep a HOSTED_ELSEWHERE reason for a corpus that now has a spoke', () => {
    const have = new Set<string>(spokes.map((s) => s.slug))
    const stale = Object.keys(HOSTED_ELSEWHERE).filter((s) => have.has(s))
    expect(stale, `remove from HOSTED_ELSEWHERE: ${stale.join(', ')}`).toEqual([])
  })
})
