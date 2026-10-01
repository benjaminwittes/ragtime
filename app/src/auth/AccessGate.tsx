import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { OwlSpot } from '@/owl/OwlSpot'
import { Input } from '@/components/ui/input'
import { toLogical } from '@/lib/routing'
import { OWL_LAB } from '@/owl/lab/path'

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
 * In a build with the tuning layer (`npm run dev`, or `VITE_TUNER=1`) the owl lab is let
 * through as well, for the same reason in miniature: it is a page for looking at the owl
 * while tuning it, and a tuner should not need the beta's code to do that. A production
 * build has no such page, and `__RT_TUNE__` folds this exemption away with it.
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

function onOpenPath(): boolean {
  const path = toLogical(window.location.pathname).replace(/\/+$/, '')
  return path === '/stage' || (__RT_TUNE__ === true && path === OWL_LAB)
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  const [open, setOpen] = useState(onOpenPath)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const onRoute = () => setOpen(onOpenPath())
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  if (unlocked || open) return <>{children}</>

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
        <OwlSpot site="gate" shake={error} occasion={error ? 'wrong-code' : null} />
        <h1 className="font-serif text-3xl font-bold tracking-tight">RAGtime</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A Lawfare research surface. This beta is access-restricted — enter the
          access code to continue.
        </p>
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
