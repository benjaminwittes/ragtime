import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { accountFrom, type PaidAccount } from './account'
import { getSupabase } from './supabase'
import { workerFetch } from '@lawfare/ragtime-client'
import { WORKER_URL } from '@/lib/worker-url'
import {
  GOOGLE_REQUIRED,
  googleOffered,
  isGoogleRequired,
  mustUseGoogle,
  refusalInWords,
  returnErrorIn,
  withoutReturnError,
} from './sign-in'

/**
 * Paid-tier auth context.
 *
 * Tracks: Supabase session (a JWT, from a magic link or from Google) + the Worker-side account
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

export type { PaidAccount, PaidLedgerEntry } from './account'

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
  /** The Worker refused this session because its address must sign in with
   *  Google (HTTP 403, code `google_required`). The page then says so beside
   *  the Google button, in place of a balance. False when signed out. */
  googleRequired: boolean

  /** Send a magic-link email. Returns an error message on failure, null
   *  on success (UI then shows "check your email"). An address that must
   *  sign in with Google is sent nothing and gets that sentence back.
   *  `returnTo` is the address the link opens; this page when omitted. */
  signInWithEmail: (email: string, returnTo?: string) => Promise<string | null>
  /** Leave for Google's sign-in page. Returns an error message when the
   *  browser could not be sent there; on success the page is on its way out
   *  and comes back signed in. Offer it only when `googleOffered()` says so.
   *  `returnTo` is the address to come back to; this page when omitted. */
  signInWithGoogle: (returnTo?: string) => Promise<string | null>
  /** Why this page was opened from a sign-in link, or from Google, without
   *  getting a session: an expired or used link, a refusal. `null` otherwise. */
  returnError: string | null
  /** Forget `returnError` once it has been shown. */
  clearReturnError: () => void
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
  const [googleRequired, setGoogleRequired] = useState(false)
  // Read before the SDK starts, which is the effect below: a failed return
  // is in the address the page was opened on and nowhere else.
  const [returnError, setReturnError] = useState<string | null>(() =>
    returnErrorIn(window.location.search, window.location.hash),
  )
  const clearReturnError = useCallback(() => setReturnError(null), [])

  // On mount: ask the Supabase SDK for the current session, and subscribe
  // to changes. Magic-link and Google returns surface here as a new
  // SIGNED_IN event after the SDK consumes the URL fragment.
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
        // The SDK has read the address by now. It leaves a failed return's
        // keys in place, where a reload would report the failure again.
        const { search, hash } = window.location
        const clean = withoutReturnError(search, hash)
        if (clean.search !== search || clean.hash !== hash) {
          window.history.replaceState(
            window.history.state,
            '',
            window.location.pathname + clean.search + clean.hash,
          )
        }
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
        setGoogleRequired(false)
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
      setGoogleRequired(false)
      return null
    }
    setBalanceLoading(true)
    setBalanceError(null)
    try {
      let resp = await workerFetch(`${WORKER_URL}/api/balance`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${current.access_token}` },
      })
      // 401 = JWT expired or revoked. Try a refresh once, then retry.
      if (resp.status === 401) {
        const refreshed = await sb.auth.refreshSession()
        const newTok = refreshed.data.session?.access_token
        if (newTok) {
          resp = await workerFetch(`${WORKER_URL}/api/balance`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${newTok}` },
          })
        }
      }
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
        // Not a failed fetch: the Worker is saying this address signs in
        // with Google. The page says that beside the button, and there is no
        // balance to show.
        if (isGoogleRequired(resp.status, body)) {
          setGoogleRequired(true)
          setAccount(null)
          return null
        }
        throw new Error(
          body.error?.message ?? `Balance fetch failed (${resp.status})`,
        )
      }
      const next = accountFrom(await resp.json())
      setGoogleRequired(false)
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
    async (email: string, returnTo?: string): Promise<string | null> => {
      const sb = getSupabase()
      const redirectTo = returnTo ?? window.location.origin + window.location.pathname
      try {
        // No link for an address that must use Google: it would sign the
        // person in to a session the Worker then refuses.
        if (mustUseGoogle(email, await googleOffered())) return GOOGLE_REQUIRED
        const r = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        })
        if (r.error) return refusalInWords(r.error, await googleOffered())
        return null
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    },
    [],
  )

  const signInWithGoogle = useCallback(async (returnTo?: string): Promise<string | null> => {
    const sb = getSupabase()
    // Back to the page they left from, as the email link does.
    const redirectTo = returnTo ?? window.location.origin + window.location.pathname
    try {
      const r = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      return r.error ? r.error.message : null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [])

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
    setGoogleRequired(false)
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
      googleRequired,
      signInWithEmail,
      signInWithGoogle,
      returnError,
      clearReturnError,
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
      googleRequired,
      signInWithEmail,
      signInWithGoogle,
      returnError,
      clearReturnError,
      signOut,
      refreshBalance,
      applyBalanceFromWorker,
    ],
  )

  return <PaidContext.Provider value={value}>{children}</PaidContext.Provider>
}
