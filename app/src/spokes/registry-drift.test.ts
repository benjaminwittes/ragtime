import { beforeAll, describe, expect, it } from 'vitest'
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
 * checked-in copy would only drift the same way. The fetch happens once, in
 * `beforeAll`, with its own timeouts, so no test waits on the network.
 *
 * If the Worker cannot be reached: on a developer machine the two comparison
 * tests skip with a warning (an offline laptop is not drift). In CI they FAIL,
 * because a guard that silently does nothing where it matters is worse than no
 * guard, and the fix for that is a runner with outbound access to the Worker.
 */

/**
 * Registry corpora that deliberately have no spoke of their own. Each entry
 * carries the reason, so adding one is a decision somebody can read.
 */
const HOSTED_ELSEWHERE: Record<string, string> = {
  clemency: 'presidential acts; shown inside the Presidential Documents spoke (see App.tsx routing)',
  lawfare: "kept in the client's slug union for old types only; the live spoke for this material is commentary",
}

const FETCH_TIMEOUT_MS = 8_000
const ATTEMPTS = 2

let slugs: string[] | null = null
let fetchError = ''

beforeAll(async () => {
  for (let i = 0; i < ATTEMPTS && !slugs; i++) {
    try {
      const r = await fetchRegistry({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      slugs = r.corpora.map((c) => c.slug)
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e)
    }
  }
  if (!slugs) console.warn(`registry-drift: could not reach the Worker registry: ${fetchError}`)
}, FETCH_TIMEOUT_MS * ATTEMPTS + 5_000)

/** The registry's slugs, or skip (locally) / fail (in CI) when it could not be read. */
function requireSlugs(ctx: { skip: () => never }): string[] {
  if (slugs) return slugs
  if (process.env.CI) {
    throw new Error(
      `CI could not reach the Worker registry (${fetchError}). The drift guard needs outbound access to the Worker; it does not skip in CI.`,
    )
  }
  return ctx.skip()
}

describe('spoke list against the Worker corpus registry', () => {
  it('has a spoke for every registry corpus, or a stated reason it has none', (ctx) => {
    const live = requireSlugs(ctx)
    const have = new Set<string>(spokes.map((s) => s.slug))
    const missing = live.filter((s) => !have.has(s) && !(s in HOSTED_ELSEWHERE))
    expect(
      missing,
      `registry corpora with no spoke: ${missing.join(', ')}. Add a spoke in spokes/registry.ts, or list the slug in HOSTED_ELSEWHERE with a reason.`,
    ).toEqual([])
  })

  it('has no spoke for a corpus the registry does not list', (ctx) => {
    const live = requireSlugs(ctx)
    const known = new Set(live)
    const orphans = spokes.map((s) => s.slug as string).filter((s) => !known.has(s))
    expect(orphans, `spokes with no registry corpus: ${orphans.join(', ')}`).toEqual([])
  })

  it('does not keep a HOSTED_ELSEWHERE reason for a corpus that now has a spoke', () => {
    const have = new Set<string>(spokes.map((s) => s.slug))
    const stale = Object.keys(HOSTED_ELSEWHERE).filter((s) => have.has(s))
    expect(stale, `remove from HOSTED_ELSEWHERE: ${stale.join(', ')}`).toEqual([])
  })
})
