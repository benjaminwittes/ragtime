import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Owl } from '@/components/Owl'
import { Input } from '@/components/ui/input'
import { toLogical } from '@/lib/routing'
import { GoogleButton } from './GoogleSignIn'
import { GOOGLE_ONLY_DOMAINS, opensTheGate, returnErrorIn } from './sign-in'
import { getSupabase } from './supabase'
import { useGoogleOffered } from './use-google-offered'

/**
 * Soft outer-gate for the closed beta. Sits in front of everything (the whole
 * provider tree boots only once unlocked) so the app stays off Google and out
 * of casual hands while it's still pre-launch.
 *
 * This is deliberately a *soft* gate: the code ships in the client bundle, so
 * anyone reading source can find it. It is not an auth boundary — the real
 * boundaries (Supabase JWT, the Worker's beta allowlist for the paid tier)
 * are server-side. Its only job is to keep randos out of the beta surface.
 * Ports the v7-era `ACCESS_CODE` overlay from the legacy single-file app.
 *
 * One path is let through without the code: `/stage`. It is a seat in an
 * audience — it shows only what a presenter chooses to put in front of a room,
 * and nothing at all when nobody is presenting — and an audience handed a link
 * and then asked for a code it was not given is a presentation that starts
 * late. Every way out of the stage into the app opens a new tab, which meets
 * this gate like any other arrival; and the path is re-read on every route
 * change, so nothing that moves this tab elsewhere carries the exemption along.
 *
 * Lawfare's own people are let through without the code too: anyone signed in with a
 * Lawfare Google account (`opensTheGate`). The Ledger signs its readers in against the same
 * accounts project, so a reader who follows a link from a Ledger post to a record page
 * is one "Continue with Google" from it, with no code to be handed. The button shows only
 * when the auth project says Google is on, as every sign-in form here does. Signing in
 * unlocks the gate the same way the code does, and stays unlocked on sign-out, because the
 * gate was never an auth boundary and should not start pretending to be one.
 */

const ACCESS_CODE = 'lawfare2026'
const LS_KEY = 'ragtime_beta_access_v1'

function isUnlocked(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

function persistUnlocked() {
  try {
    localStorage.setItem(LS_KEY, '1')
  } catch {
    // Private mode — fine, it just won't persist across reloads.
  }
}

function onStage(): boolean {
  return toLogical(window.location.pathname).replace(/\/+$/, '') === '/stage'
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  const [staged, setStaged] = useState(onStage)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const google = useGoogleOffered()
  const [leaving, setLeaving] = useState(false)
  const [refused, setRefused] = useState<string | null>(() =>
    returnErrorIn(window.location.search, window.location.hash),
  )

  useEffect(() => {
    const onRoute = () => setStaged(onStage())
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  // A session already held, or one arriving back from Google in this address: the client
  // reads the address as it starts, and getSession waits for that.
  useEffect(() => {
    if (unlocked) return
    let live = true
    const sb = getSupabase()
    const consider = (user: Parameters<typeof opensTheGate>[0]) => {
      if (!live || !user) return
      if (opensTheGate(user)) {
        persistUnlocked()
        setUnlocked(true)
      } else {
        setRefused('That account is not a Lawfare Google account. Enter the access code.')
      }
    }
    void sb.auth.getSession().then(({ data }) => consider(data.session?.user))
    const { data } = sb.auth.onAuthStateChange((_event, session) => consider(session?.user))
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [unlocked])

  if (unlocked || staged) return <>{children}</>

  async function onGoogle() {
    setLeaving(true)
    setRefused(null)
    const { origin, pathname, search } = window.location
    const r = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      // Back to the page they came for; `hd` asks Google to offer Lawfare accounts first.
      options: { redirectTo: origin + pathname + search, queryParams: { hd: GOOGLE_ONLY_DOMAINS[0] } },
    })
    if (r.error) {
      setLeaving(false)
      setRefused(r.error.message)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (value === ACCESS_CODE) {
      persistUnlocked()
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm">
        {/* The owl keeps the door. A wrong code gets a shake of the head, which runs again
            on each refusal because typing clears `error` and takes the class off with it. */}
        <Owl className={error ? 'mb-4 w-16 owl-no' : 'mb-4 w-16'} />
        <h1 className="font-serif text-3xl font-bold tracking-tight">RAGtime</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A Lawfare research surface. This beta is access-restricted — enter the
          access code to continue.
        </p>
        {google && (
          <div className="mt-6 space-y-2">
            <GoogleButton onClick={() => void onGoogle()} leaving={leaving} />
            <p className="text-xs text-muted-foreground">
              Lawfare staff: sign in with your Lawfare Google account instead of a code.
            </p>
          </div>
        )}
        {refused && <p className="mt-3 text-sm text-destructive">{refused}</p>}
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <Input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(false)
            }}
            placeholder="Access code"
            aria-label="Access code"
            aria-invalid={error}
            className="h-10"
          />
          {error && (
            <p className="text-sm text-destructive">Incorrect code.</p>
          )}
          <Button type="submit" className="w-full">
            Enter
          </Button>
        </form>
      </div>
    </main>
  )
}
