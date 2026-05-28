import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

/**
 * Paid-tier auth context.
 *
 * Tracks: Supabase session (= magic-link JWT) + the Worker-side account
 * snapshot (balance, per-query cap, ledger). The session is owned by the
 * Supabase client and replayed here through onAuthStateChange so React
 * stays in sync. Balance is refreshed on sign-in, on visibility-regain,
 * and on demand via `refreshBalance()`.
 *
 * Storage: the Supabase JS SDK persists the session in localStorage on its
 * own (key `sb-aikdbjprndgksibbvcfs-auth-token`). We don't touch that —
 * persistence is the SDK's concern.
 *
 * Per the React-refresh fast-refresh contract, the `usePaid` hook lives
 * in a sibling `use-paid.ts` so this file only exports a component.
 */

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ||
  'https://ragtimeproxy.benjamin-wittes.workers.dev'

export type PaidLedgerEntry = {
  at: string
  cost_cents: number
  /** Free-form label; what kind of call charged this. */
  kind?: string
}

export type PaidAccount = {
  balance_cents: number
  per_query_cap_cents: number
  ledger?: readonly PaidLedgerEntry[]
}

export type PaidContextValue = {
  /** Active Supabase session. `null` when signed out. */
  session: Session | null
  /** True once the initial getSession() resolves — gates UI flashes. */
  ready: boolean
  /** Convenience: signed in iff there's a session with a JWT. */
  signedIn: boolean
  /** User's email, when available from the session. */
  email: string | null
  /** Worker-side account snapshot. `null` until refresh succeeds. */
  account: PaidAccount | null
  /** True while a balance fetch is in flight. */
  balanceLoading: boolean
  /** Last balance-fetch error message (if any). Cleared on success. */
  balanceError: string | null

  /** Send a magic-link email. Returns an error message on failure, null
   *  on success (UI then shows "check your email"). */
  signInWithEmail: (email: string) => Promise<string | null>
  /** Sign out + clear local state. */
  signOut: () => Promise<void>
  /** Fetch /api/balance from the Worker using the current JWT. No-op when
   *  signed out. Returns the new account, or null on failure. */
  refreshBalance: () => Promise<PaidAccount | null>
  /** Apply a worker-returned balance delta locally without a round-trip
   *  (called after every paid call that returns _balance_cents). */
  applyBalanceFromWorker: (newBalanceCents: number) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const PaidContext = createContext<PaidContextValue | undefined>(
  undefined,
)

export function PaidProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState<PaidAccount | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  // On mount: ask the Supabase SDK for the current session, and subscribe
  // to changes. Magic-link returns surface here as a new SIGNED_IN event
  // after the SDK consumes the URL fragment.
  useEffect(() => {
    const sb = getSupabase()
    let cancelled = false

    void (async () => {
      try {
        const r = await sb.auth.getSession()
        if (cancelled) return
        setSession(r.data.session ?? null)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      if (cancelled) return
      setSession(next ?? null)
      // Clear the account snapshot on sign-out so balance widgets don't
      // briefly show stale numbers from a previous user.
      if (!next) {
        setAccount(null)
        setBalanceError(null)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const refreshBalance = useCallback(async (): Promise<PaidAccount | null> => {
    const sb = getSupabase()
    const current = (await sb.auth.getSession()).data.session
    if (!current?.access_token) {
      setAccount(null)
      return null
    }
    setBalanceLoading(true)
    setBalanceError(null)
    try {
      let resp = await fetch(`${WORKER_URL}/api/balance`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${current.access_token}` },
      })
      // 401 = JWT expired or revoked. Try a refresh once, then retry.
      if (resp.status === 401) {
        const refreshed = await sb.auth.refreshSession()
        const newTok = refreshed.data.session?.access_token
        if (newTok) {
          resp = await fetch(`${WORKER_URL}/api/balance`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${newTok}` },
          })
        }
      }
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
        throw new Error(
          body.error?.message ?? `Balance fetch failed (${resp.status})`,
        )
      }
      const data = (await resp.json()) as {
        balance_cents?: number
        per_query_cap_cents?: number
        ledger?: PaidLedgerEntry[]
      }
      const next: PaidAccount = {
        balance_cents: typeof data.balance_cents === 'number' ? data.balance_cents : 0,
        per_query_cap_cents:
          typeof data.per_query_cap_cents === 'number'
            ? data.per_query_cap_cents
            : 500,
        ledger: data.ledger ?? [],
      }
      setAccount(next)
      return next
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  // Refresh balance on sign-in (and on tab regain to catch async top-ups).
  // refreshBalance() sets state synchronously at the start (loading flag)
  // before awaiting — that's the call this rule flags. It's a legitimate
  // external-sync effect (fetch + update local state with the result), so
  // we suppress the rule rather than restructure into a less direct pattern.
  useEffect(() => {
    if (!session) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshBalance()
    function onVisible() {
      if (document.visibilityState === 'visible') void refreshBalance()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [session, refreshBalance])

  const signInWithEmail = useCallback(
    async (email: string): Promise<string | null> => {
      const sb = getSupabase()
      const redirectTo = window.location.origin + window.location.pathname
      try {
        const r = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        })
        if (r.error) return r.error.message
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    const sb = getSupabase()
    try {
      await sb.auth.signOut()
    } catch {
      // Swallow — SIGNED_OUT event handler still clears local state below.
    }
    setSession(null)
    setAccount(null)
    setBalanceError(null)
  }, [])

  const applyBalanceFromWorker = useCallback((newBalanceCents: number) => {
    setAccount((prev) =>
      prev ? { ...prev, balance_cents: newBalanceCents } : prev,
    )
  }, [])

  const value = useMemo<PaidContextValue>(
    () => ({
      session,
      ready,
      signedIn: !!session?.access_token,
      email: session?.user?.email ?? null,
      account,
      balanceLoading,
      balanceError,
      signInWithEmail,
      signOut,
      refreshBalance,
      applyBalanceFromWorker,
    }),
    [
      session,
      ready,
      account,
      balanceLoading,
      balanceError,
      signInWithEmail,
      signOut,
      refreshBalance,
      applyBalanceFromWorker,
    ],
  )

  return <PaidContext.Provider value={value}>{children}</PaidContext.Provider>
}
