import { beforeAll, describe, expect, it } from 'vitest'
import { CORPORA, GENERATED_REGISTRY_VERSION, HUB_GROUPS, LIVE_APIS, DEFAULT_WORKER_URL } from '@lawfare/ragtime-client'
import { spokeGroups, spokes } from './registry'

/**
 * Drift guard for the app's corpus list.
 *
 * `ragtime-worker/worker/registry.js` is the one source of truth for which
 * corpora exist, how the hub groups them, what they are called and which live
 * APIs sit beside them. The app does not keep its own copy: the hub groups,
 * the CorpusSlug type, the chip labels and the live-API row are all read from
 * `packages/client/src/generated/registry.ts`, which `npm run registry:sync`
 * writes from the Worker. So the thing that can drift now is that one file
 * going stale, and that is what this test catches.
 *
 * It reads the live registry because the Worker deploys on its own. The call
 * is slow when the Worker's 30-minute edge cache is cold (about 9s), and a
 * deploy does not purge that cache, so the URL carries a throwaway `fresh`
 * parameter that always misses it. The fetch happens once, in `beforeAll`.
 *
 * If the Worker cannot be reached: on a developer machine the live comparison
 * skips with a warning (an offline laptop is not drift). In CI it FAILS,
 * because a guard that silently does nothing where it matters is worse than
 * no guard.
 */

const FETCH_TIMEOUT_MS = 25_000
const ATTEMPTS = 2

let liveVersion: string | null = null
let fetchError = ''

beforeAll(async () => {
  for (let i = 0; i < ATTEMPTS && !liveVersion; i++) {
    try {
      const r = await fetch(`${DEFAULT_WORKER_URL}/corpus/registry?fresh=${Date.now()}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      liveVersion = ((await r.json()) as { version: string }).version
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e)
    }
  }
  if (!liveVersion) console.warn(`registry-drift: could not reach the Worker registry: ${fetchError}`)
}, FETCH_TIMEOUT_MS * ATTEMPTS + 5_000)

describe('the generated registry against the live Worker', () => {
  it('is current: the generated version matches the Worker registry version', (ctx) => {
    if (!liveVersion) {
      if (process.env.CI) {
        throw new Error(
          `CI could not reach the Worker registry (${fetchError}). The drift guard needs outbound access to the Worker; it does not skip in CI.`,
        )
      }
      return ctx.skip()
    }
    expect(
      GENERATED_REGISTRY_VERSION,
      'the Worker registry changed (a corpus, name, hub placement or live API). Run `npm run registry:sync` and commit packages/client/src/generated/registry.ts.',
    ).toBe(liveVersion)
  })
})

describe('the hub against the generated registry', () => {
  const cardSlugs = CORPORA.filter((c) => c.hub !== null).map((c) => c.slug as string)

  it('has a spoke for every corpus the registry gives a hub card, in registry order', () => {
    const expected = HUB_GROUPS.flatMap((g) => g.corpora as readonly string[])
    expect(spokes.map((s) => s.slug as string)).toEqual(expected)
    expect([...expected].sort()).toEqual([...cardSlugs].sort())
  })

  it('renders one group per registry group, under the registry heading', () => {
    expect(spokeGroups.map((g) => g.heading)).toEqual(HUB_GROUPS.map((g) => g.heading))
  })

  it('titles each card with the registry hub title', () => {
    for (const s of spokes) {
      const entry = CORPORA.find((c) => c.slug === s.slug)
      expect(entry?.hub?.title).toBe(s.title)
    }
  })

  it('keeps live APIs out of the corpora', () => {
    const slugs = new Set<string>(CORPORA.map((c) => c.slug))
    for (const a of LIVE_APIS) expect(slugs.has(a.slug)).toBe(false)
  })
})
