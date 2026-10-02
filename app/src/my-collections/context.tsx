import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { probeMyCollections, type MyCollection } from '@lawfare/ragtime-client'

import { usePaid } from '@/auth/use-paid'

import { detectMyCollections, type MyCollectionsAvailability } from './availability'

/**
 * Collections for the signed-in reader, or the fact that there are none to show.
 *
 * Mounted once at the root, so the bar's link, the save control in a document
 * sheet and the pages all read one answer and the worker is asked once per
 * sign-in rather than once per control.
 *
 * `available` is false until the worker has answered with a list. That covers
 * a signed-out reader (no request is made), a worker whose routes are not
 * switched on yet (it answers 404), and a worker that could not be reached.
 * In all three, everything that reads this context renders nothing.
 *
 * Per the fast-refresh contract the hook lives in `use-my-collections.ts`, as
 * `usePaid` does beside `paid-context.tsx`.
 */

export type MyCollectionsValue = {
  /** The reader is signed in and the worker has collections switched on. */
  available: boolean
  /** The question has been answered one way or the other (for a page deciding between "loading" and "not found"). */
  checked: boolean
  collections: readonly MyCollection[]
  /** The organization the reader is an active member of, when there is one. */
  org: { slug: string } | null
  /** The session token the calls are made with. Null when signed out. */
  sessionToken: string | null
  /** Read the list again, after something changed it. */
  refresh: () => Promise<void>
}

const UNAVAILABLE: MyCollectionsValue = {
  available: false,
  checked: false,
  collections: [],
  org: null,
  sessionToken: null,
  refresh: async () => {},
}

// eslint-disable-next-line react-refresh/only-export-components
export const MyCollectionsContext = createContext<MyCollectionsValue>(UNAVAILABLE)

type Answer = { userId: string | null; result: MyCollectionsAvailability }

export function MyCollectionsProvider({ children }: { children: ReactNode }) {
  const paid = usePaid()
  const sessionToken = paid.session?.access_token ?? null
  const userId = paid.session?.user?.id ?? null
  const [answer, setAnswer] = useState<Answer | null>(null)

  const ask = useCallback(async (): Promise<Answer> => {
    return { userId, result: await detectMyCollections(sessionToken, probeMyCollections) }
  }, [sessionToken, userId])

  useEffect(() => {
    if (!paid.ready) return
    let cancelled = false
    void ask().then((next) => {
      if (!cancelled) setAnswer(next)
    })
    return () => {
      cancelled = true
    }
  }, [ask, paid.ready])

  const refresh = useCallback(async () => {
    setAnswer(await ask())
  }, [ask])

  const value = useMemo<MyCollectionsValue>(() => {
    // An answer given for somebody else (the reader signed out, or in as
    // another person) is no answer: nothing shows until this reader's arrives.
    const current = answer && answer.userId === userId ? answer.result : null
    if (!current) return { ...UNAVAILABLE, sessionToken, refresh }
    if (!current.available) return { ...UNAVAILABLE, checked: true, sessionToken, refresh }
    return {
      available: true,
      checked: true,
      collections: current.list.collections,
      org: current.list.org ?? null,
      sessionToken,
      refresh,
    }
  }, [answer, userId, sessionToken, refresh])

  return <MyCollectionsContext.Provider value={value}>{children}</MyCollectionsContext.Provider>
}
