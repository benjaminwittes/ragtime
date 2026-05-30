import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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

export function AccessGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isUnlocked)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return <>{children}</>

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
