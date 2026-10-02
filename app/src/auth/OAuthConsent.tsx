import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GoogleButton, OrByEmail } from '@/auth/GoogleSignIn'
import { GOOGLE_REQUIRED, mustUseGoogle } from '@/auth/sign-in'
import { getSupabase } from '@/auth/supabase'
import { useGoogleOffered } from '@/auth/use-google-offered'
import { usePaid } from '@/auth/use-paid'
import { toHref } from '@/lib/routing'
import {
  CONSENT_PATH,
  consentReturnUrl,
  consentStep,
  hostOf,
  readAuthorizationId,
  whoPaysInWords,
} from './oauth-consent'

/**
 * OAuth consent page (route `/oauth/consent`).
 *
 * The auth project's OAuth 2.1 server redirects a person here when a client —
 * Claude, through the RAGtime MCP connector — asks to act as a RAGtime user.
 * The auth project does not host this page; the app does, and talks to the
 * server through `supabase.auth.oauth.*`:
 *
 *   1. No session → sign in, with Google when the auth project offers it and
 *      by email link otherwise. Either way the return address is THIS page
 *      with the same `authorization_id`, so the flow resumes where it paused.
 *   2. Session → `getAuthorizationDetails(id)`: either the client's name,
 *      redirect host and requested scopes (render the decision), or a
 *      `redirect_url` because the person already consented (leave at once).
 *   3. Approve / deny → the server answers with the redirect back to the
 *      client, carrying the authorization code.
 *
 * An address that must sign in with Google (`GOOGLE_ONLY_DOMAINS`) is not sent
 * an email link, and a session on such an address that was not made by Google
 * is offered the Google button in place of Approve: the service would refuse
 * every AI call the client made as that session.
 *
 * Rendered OUTSIDE the beta `AccessGate` (see main.tsx): a connector user
 * arrives here mid-flow from another app and has usually never seen the
 * wall, which would strand them. The page holds nothing the wall protects —
 * it is a sign-in form and a yes/no.
 *
 * What approval means, stated on the page: the client can search the record
 * and run AI research as this person, and who pays for the AI calls, which
 * the service decides and `/api/balance` reports.
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

/** The address a sign-in started here must come back to. */
function returnAddress(authorizationId: string): string {
  return consentReturnUrl(window.location.origin + toHref(CONSENT_PATH), authorizationId)
}

function Consent({ authorizationId }: { authorizationId: string }) {
  const paid = usePaid()
  const { session, ready, signOut } = paid
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Once signed in, ask the server what this authorization is. A person who
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

  const step = consentStep({
    ready,
    signedIn: !!session,
    googleRequired: paid.googleRequired,
    billingSettled: paid.account !== null || paid.balanceError !== null,
    hasDetails: details !== null,
  })

  if (step === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (step === 'sign-in') {
    return <SignIn authorizationId={authorizationId} />
  }

  if (step === 'google-required') {
    return (
      <>
        <GoogleRequired authorizationId={authorizationId} />
        <NotYou busy={busy} onSignOut={() => void signOut()} />
      </>
    )
  }

  if (step === 'checking' || !details) {
    return (
      <>
        <p className="text-sm text-muted-foreground">Checking what is being asked for…</p>
        {error && <ErrorLine message={error} />}
      </>
    )
  }

  return (
    <div data-consent="decide">
      <p className="text-sm text-foreground">
        <strong>{details.clientName}</strong> wants to use RAGtime as{' '}
        <strong>{details.email}</strong>.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        It will be able to search the record and run AI research on your behalf.{' '}
        {whoPaysInWords(paid.account?.billing ?? null)}
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
      <NotYou busy={busy} onSignOut={() => void signOut()} />
    </div>
  )
}

function NotYou({ busy, onSignOut }: { busy: boolean; onSignOut: () => void }) {
  return (
    <p className="mt-6 text-xs text-muted-foreground">
      Not you?{' '}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        disabled={busy}
        onClick={onSignOut}
      >
        Sign out
      </button>{' '}
      and sign in with another address.
    </p>
  )
}

/** Leaving for Google, and what to say when the browser could not be sent there. */
function useGoogleSignIn(authorizationId: string) {
  const paid = usePaid()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    setError(null)
    setLeaving(true)
    const errMsg = await paid.signInWithGoogle(returnAddress(authorizationId))
    // No error means the browser is already on its way to Google, and the
    // button stays as it is until the page goes.
    if (errMsg) {
      setError(errMsg)
      setLeaving(false)
    }
  }
  return { leaving, error, go }
}

/**
 * A session the service refuses because its address must sign in with Google.
 * Approving would connect an account that cannot ask anything, so the page
 * says the service's sentence and offers the button, and no Approve.
 */
function GoogleRequired({ authorizationId }: { authorizationId: string }) {
  const offered = useGoogleOffered()
  const google = useGoogleSignIn(authorizationId)
  return (
    <div data-consent="google-required" className="space-y-3">
      <p role="status" className="text-sm font-medium text-foreground">
        {GOOGLE_REQUIRED}
      </p>
      <p className="text-sm text-muted-foreground">
        This sign-in was not made with Google. Continue with Google using the same address
        to finish connecting.
      </p>
      {offered && <GoogleButton onClick={() => void google.go()} leaving={google.leaving} />}
      {google.error && <ErrorLine message={google.error} />}
    </div>
  )
}

function SignIn({ authorizationId }: { authorizationId: string }) {
  const paid = usePaid()
  const offered = useGoogleOffered()
  const google = useGoogleSignIn(authorizationId)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  // A failed return (a dead link, a refusal at Google) is this form's first
  // error, and is said once: taken from the context here, and forgotten there.
  const [error, setError] = useState<string | null>(paid.returnError)
  const [busy, setBusy] = useState(false)
  const { clearReturnError } = paid
  useEffect(() => clearReturnError(), [clearReturnError])
  // An address that signs in with Google gets no email link. Said as soon as
  // the address is typed, and only when there is a Google button to point at.
  const needsGoogle = mustUseGoogle(email, offered)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // The notice under the field already says why; nothing is sent.
    if (needsGoogle) return
    setBusy(true)
    setError(null)
    const errMsg = await paid.signInWithEmail(email.trim(), returnAddress(authorizationId))
    setBusy(false)
    if (errMsg) setError(errMsg)
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
    <div data-consent="sign-in">
      <p className="text-sm text-muted-foreground">
        An app is asking to use RAGtime as you. Sign in to see what it is asking for. New
        here? Signing in creates your RAGtime account.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
        {offered && (
          <>
            <GoogleButton
              onClick={() => void google.go()}
              leaving={google.leaving}
              disabled={busy}
              pointedAt={needsGoogle}
            />
            <OrByEmail />
          </>
        )}
        <Input
          type="email"
          autoComplete="email"
          autoFocus={!offered}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.org"
          aria-label="Email address"
          className="h-10"
          disabled={busy || google.leaving}
        />
        {needsGoogle && (
          <p role="status" data-google-required="" className="text-sm text-foreground">
            {GOOGLE_REQUIRED} Use the button above.
          </p>
        )}
        {(error ?? google.error) && <ErrorLine message={(error ?? google.error)!} />}
        <Button
          type="submit"
          variant={offered ? 'outline' : 'default'}
          className="w-full"
          disabled={busy || google.leaving || !email.trim() || needsGoogle}
        >
          {busy ? 'Sending…' : 'Send sign-in link'}
        </Button>
      </form>
    </div>
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
  return (
    <p role="alert" className="mt-3 text-sm text-destructive">
      {message}
    </p>
  )
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
