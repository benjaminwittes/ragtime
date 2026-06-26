import { useCallback, useState } from 'react'
import {
  type MoreLikeThisCorpus,
  type MoreLikeThisResult,
  runMoreLikeThis,
} from '@/lib/worker-client'
import type { AuthArg } from '@/lib/auth-arg'

/**
 * "More like this" stack runtime (briefs §3; stash-and-start-new semantics
 * declared in src/stack/types.ts).
 *
 * The pivot is NOT a push onto the spoke's own operation history — it stashes
 * the current spoke view and starts a NEW stack seeded with the similarity
 * results. This hook owns that new stack:
 *
 *   - The spoke view we return to is the "stashed" context (just a label here;
 *     the spoke component stays mounted, so its React state is preserved and
 *     restored verbatim when the user backs all the way out).
 *   - `pages` is the active pivot stack. Pivoting again from a result pushes a
 *     page; `back()` pops; popping the last page returns to the stashed spoke.
 *
 * v1 pilots this on a single spoke (OLC). Modeling every spoke operation as a
 * unified Stack (so a pivot can stash a multi-operation litigation stack) is
 * the fan-out follow-up; the user-visible behavior here is already the designed
 * stash-and-start-new flow.
 */

const MLT_DEFAULT_K = 25
const MLT_MAX_K = 50

/** The seed for a pivot — a document the user wants "more like". */
export type MltSeed = { id: number; title: string | null }

/** One page on the pivot stack: the request that produced it + the result. */
export type MltPage = {
  id: string
  seed: MltSeed
  /** The "in what way?" axis answer ('' for overall similarity). */
  prompt: string
  route: 'auto' | 'meaning'
  k: number
  result: MoreLikeThisResult
}

export type MoreLikeThisController = {
  /** Seed awaiting an "in what way?" answer; non-null = ask-UI is open. */
  pendingSeed: MltSeed | null
  /** Open the ask-UI for a seed (from a detail sheet or a result card). */
  requestPivot: (seed: MltSeed) => void
  /** Dismiss the ask-UI without pivoting. */
  cancelPivot: () => void
  /** Run the pivot for the pending seed with the chosen axis. */
  submitPivot: (opts: { prompt: string; route: 'auto' | 'meaning' }) => Promise<void>

  /** The active pivot stack (tip = last). Empty = no pivot in progress. */
  pages: MltPage[]
  /** True when a pivot stack is active (spoke view is stashed). */
  active: boolean
  /** Label of the stashed spoke view we return to (e.g. "OLC search"). */
  stashedLabel: string
  loading: boolean
  error?: string

  /** Pop the tip; popping the last page returns to the stashed spoke view. */
  back: () => void
  /** Jump to an earlier page in the chain (truncates the stack to it). */
  goToPage: (index: number) => void
  /** Re-run the tip's pivot at the maximum result count. */
  widen: () => Promise<void>
  /** Discard the whole pivot stack and return to the stashed spoke view. */
  reset: () => void
}

export function useMoreLikeThis(opts: {
  slug: MoreLikeThisCorpus
  auth: AuthArg | null
  stashedLabel: string
  onBalance?: (cents: number) => void
  /** Fired after each successful pivot — the spoke uses it to log to the
   *  internal usage log (the Worker logs server-side independently). */
  onResult?: (page: MltPage) => void
}): MoreLikeThisController {
  const { slug, auth, stashedLabel, onBalance, onResult } = opts
  const [pendingSeed, setPendingSeed] = useState<MltSeed | null>(null)
  const [pages, setPages] = useState<MltPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const requestPivot = useCallback((seed: MltSeed) => {
    setError(undefined)
    setPendingSeed(seed)
  }, [])

  const cancelPivot = useCallback(() => setPendingSeed(null), [])

  const runPivot = useCallback(
    async (
      seed: MltSeed,
      prompt: string,
      route: 'auto' | 'meaning',
      k: number,
      replaceTip: boolean,
    ) => {
      if (!auth) {
        setError('Configure AI access (header, top right) first.')
        return
      }
      setLoading(true)
      setError(undefined)
      try {
        const result = await runMoreLikeThis(
          { slug, seedId: seed.id, prompt, route, k },
          auth,
        )
        if (typeof result._balance_cents === 'number') {
          onBalance?.(result._balance_cents)
        }
        const page: MltPage = {
          id: crypto.randomUUID(),
          seed,
          prompt,
          route,
          k,
          result,
        }
        setPages((prev) =>
          replaceTip ? [...prev.slice(0, -1), page] : [...prev, page],
        )
        onResult?.(page)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [auth, slug, onBalance, onResult],
  )

  const submitPivot = useCallback(
    async (o: { prompt: string; route: 'auto' | 'meaning' }) => {
      const seed = pendingSeed
      if (!seed) return
      setPendingSeed(null)
      await runPivot(seed, o.prompt, o.route, MLT_DEFAULT_K, false)
    },
    [pendingSeed, runPivot],
  )

  const back = useCallback(() => {
    setError(undefined)
    setPages((prev) => prev.slice(0, -1))
  }, [])

  const goToPage = useCallback((index: number) => {
    setError(undefined)
    setPages((prev) => prev.slice(0, index + 1))
  }, [])

  const widen = useCallback(async () => {
    const tip = pages[pages.length - 1]
    if (!tip) return
    await runPivot(tip.seed, tip.prompt, tip.route, MLT_MAX_K, true)
  }, [pages, runPivot])

  const reset = useCallback(() => {
    setPages([])
    setPendingSeed(null)
    setError(undefined)
  }, [])

  return {
    pendingSeed,
    requestPivot,
    cancelPivot,
    submitPivot,
    pages,
    active: pages.length > 0,
    stashedLabel,
    loading,
    error,
    back,
    goToPage,
    widen,
    reset,
  }
}
