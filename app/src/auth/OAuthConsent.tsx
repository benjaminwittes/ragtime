import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSupabase } from '@/auth/supabase'
import { usePaid } from '@/auth/use-paid'
import { toHref } from '@/lib/routing'
import { CONSENT_PATH, consentReturnUrl, hostOf, readAuthorizationId } from './oauth-consent'

/**
 * OAuth consent page (route `/oauth/consent`).
 *
 * The APP Supabase project's OAuth 2.1 server redirects a user here when a
 * client — Claude, through the RAGtime MCP connector — asks to act as a
 * RAGtime user. Supabase does not host this page; the app does, and talks to
 * the server through `supabase.auth.oauth.*`:
 *
 *   1. No session → magic-link sign-in whose return URL is THIS page with the
 *      same `authorization_id`, so the flow resumes where it paused.
 *   2. Session → `getAuthorizationDetails(id)`: either the client's name,
 *      redirect host and requested scopes (render the decision), or a
 *      `redirect_url` because the user already consented (leave at once).
 *   3. Approve / deny → the server answers with the redirect back to the
 *      client, carrying the authorization code.
 *
 * Rendered OUTSIDE the beta `AccessGate` (see main.tsx): a connector user
 * arrives here mid-flow from another app and has usually never seen the
 * wall, which would strand them. The page holds nothing the wall protects —
 * it is a sign-in form and a yes/no.
 *
 * What approval means, stated on the page: the client can search the record
 * and run AI research as this user; AI calls are billed to the user's RAGtime
 * balance, or to Lawfare's allowance for staff accounts (the Worker decides
 * which from the signed-in email).
 */
export function OAuthConsent() {
  const authorizationId = readAuthorizationId(window.location.search)
  return (
    <Frame>
      {authorizationId ? <Consent authorizationId={authorizationId} /> : <NothingToApprove />}
    </Frame>
  )
}

type ConsentDetails = {
  clientName: string
  redirectHost: string
  scopes: string[]
  email: string
}

function Consent({ authorizationId }: { authorizationId: string }) {
  const { session, ready, signOut } = usePaid()
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Once signed in, ask the server what this authorization is. A user who
  // already consented to this client is sent straight back to it.
  useEffect(() => {
    if (!ready || !session) return
    let cancelled = false
    void (async () => {
      const r = await getSupabase().auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return
      if (r.error) {
        setError(r.error.message)
        return
      }
      if ('redirect_url' in r.data) {
        window.location.assign(r.data.redirect_url)
        return
      }
      setDetails({
        clientName: r.data.client.name,
        redirectHost: hostOf(r.data.redirect_uri),
        scopes: r.data.scope.split(' ').filter(Boolean),
        email: r.data.user.email,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [ready, session, authorizationId])

  async function decide(approve: boolean) {
    setBusy(true)
    setError(null)
    const oauth = getSupabase().auth.oauth
    const r = approve
      ? await oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (r.error) {
      setError(r.error.message)
      setBusy(false)
      return
    }
    window.location.assign(r.data.redirect_url)
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (!session) {
    return <SignIn authorizationId={authorizationId} />
  }

  if (!details) {
    return (
      <>
        <p className="text-sm text-muted-foreground">Checking what is being asked for…</p>
        {error && <ErrorLine message={error} />}
      </>
    )
  }

  return (
    <>
      <p className="text-sm text-foreground">
        <strong>{details.clientName}</strong> wants to use RAGtime as{' '}
        <strong>{details.email}</strong>.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        It will be able to search the record and run AI research on your behalf. AI calls
        are billed to your RAGtime balance, or to Lawfare&rsquo;s allowance for staff
        accounts.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        After you decide you return to <code className="font-mono">{details.redirectHost}</code>.
        {details.scopes.length > 0 && <> Requested: {details.scopes.join(', ')}.</>}
      </p>
      {error && <ErrorLine message={error} />}
      <div className="mt-6 flex gap-3">
        <Button type="button" className="flex-1" disabled={busy} onClick={() => void decide(true)}>
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Deny
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Not you?{' '}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          disabled={busy}
          onClick={() => void signOut()}
        >
          Sign out
        </button>{' '}
        and sign in with another address.
      </p>
    </>
  )
}

function SignIn({ authorizationId }: { authorizationId: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const pageUrl = window.location.origin + toHref(CONSENT_PATH)
    const r = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: consentReturnUrl(pageUrl, authorizationId) },
    })
    setBusy(false)
    if (r.error) setError(r.error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <p className="text-sm text-foreground">
        Check your email for a sign-in link. It brings you back here to finish connecting.
      </p>
    )
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        An app is asking to use RAGtime as you. Sign in to see what it is asking for. New
        here? Signing in creates your RAGtime account.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
        <Input
          type="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          aria-label="Email address"
          className="h-10"
        />
        {error && <ErrorLine message={error} />}
        <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
          Send sign-in link
        </Button>
      </form>
    </>
  )
}

function NothingToApprove() {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        This page is reached from an app asking to connect to RAGtime. There is nothing to
        approve here.
      </p>
      <a href={toHref('/')} className="mt-6 inline-block text-sm text-primary hover:underline">
        Go to RAGtime
      </a>
    </>
  )
}

function ErrorLine({ message }: { message: string }) {
  return <p className="mt-3 text-sm text-destructive">{message}</p>
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl font-bold tracking-tight">Connect to RAGtime</h1>
        <div className="mt-4">{children}</div>
        <p className="mt-10 text-xs text-muted-foreground">
          <a href={toHref('/privacy')} className="underline underline-offset-2">
            Privacy
          </a>{' '}
          &middot;{' '}
          <a href={toHref('/terms')} className="underline underline-offset-2">
            Terms
          </a>
        </p>
      </div>
    </main>
  )
}
