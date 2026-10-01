/**
 * What signing in needs that is not React: whether the project offers Google, what to say
 * when a sign-in is refused, and what to say when someone comes back from a link or from
 * Google without a session.
 *
 * ── Why the Google button asks the server ────────────────────────────────────────────────
 * Whether Google sign-in works is a setting on the auth project, not a fact about this
 * build. The project publishes which providers are on at `GET /auth/v1/settings`, readable
 * with the publishable key, so the form asks there and shows the button only on a yes. A
 * build that carries the button can therefore ship before the provider is turned on, and
 * turning the provider on (or off again) needs no deploy.
 *
 * ── Why a return's own words are not shown ───────────────────────────────────────────────
 * A sign-in that fails on the way back arrives as `error_code` and `error_description` in
 * the address. The description is whatever the link said, and a link can be written by
 * anyone, so showing it would let a stranger put their sentence in our sign-in panel. The
 * code picks one of our sentences instead, and an unknown code gets a plain one.
 */
import { APP_PROJECT_PUBLISHABLE_KEY, APP_PROJECT_URL } from './supabase.ts'

/** The part of the auth project's public settings this app reads. */
export function offersGoogle(settings: unknown): boolean {
  if (typeof settings !== 'object' || settings === null) return false
  const external = (settings as { external?: unknown }).external
  if (typeof external !== 'object' || external === null) return false
  return (external as { google?: unknown }).google === true
}

let asked: Promise<boolean> | null = null

/**
 * Whether the auth project offers Google, asked once a page. A failed ask is a no for now
 * and is asked again next time: no button is a working form, and a button that cannot
 * sign anyone in is not.
 */
export function googleOffered(): Promise<boolean> {
  asked ??= fetch(`${APP_PROJECT_URL}/auth/v1/settings`, {
    headers: { apikey: APP_PROJECT_PUBLISHABLE_KEY },
  })
    .then((r) => {
      if (!r.ok) throw new Error(`settings ${r.status}`)
      return r.json()
    })
    .then(offersGoogle)
    .catch(() => {
      asked = null
      return false
    })
  return asked
}

/** What the auth client hands back when it refuses: its words, and sometimes a code. */
export type Refusal = { message: string; code?: string; status?: number }

/**
 * A refused sign-in email, in words a person can act on.
 *
 * The one worth rewording is the hourly cap. The auth project sends a small number of
 * emails an hour for everyone together, and past it answers "email rate limit exceeded"
 * to whoever asks next, which reads as their mistake and is nobody's. The same code also
 * covers asking twice inside a minute; that message already says how long to wait, so it
 * is kept.
 */
export function refusalInWords(refusal: Refusal, google: boolean): string {
  const capped = refusal.code === 'over_email_send_rate_limit' || refusal.status === 429
  if (!capped || /\bafter \d+ seconds?\b/i.test(refusal.message)) return refusal.message
  return (
    'RAGtime can send only a few sign-in emails an hour, and this hour’s have gone. ' +
    (google ? 'Continue with Google, or try the email again in an hour.' : 'Try again in an hour.')
  )
}

const RETURN_KEYS = ['error', 'error_code', 'error_description'] as const

function returnParams(search: string, hash: string): URLSearchParams[] {
  return [new URLSearchParams(hash.replace(/^#/, '')), new URLSearchParams(search)]
}

/**
 * Why a return from a sign-in link or from Google brought no session, or null when the
 * address says nothing of the kind. The auth server writes the same three keys into the
 * query and the fragment; the fragment is read first.
 */
export function returnErrorIn(search: string, hash: string): string | null {
  for (const params of returnParams(search, hash)) {
    if (!params.has('error_code') && !params.has('error_description')) continue
    const code = (params.get('error_code') ?? params.get('error') ?? '').toLowerCase()
    if (code === 'otp_expired') {
      return 'That sign-in link has expired or was already used. Ask for a new one.'
    }
    if (code === 'access_denied') return 'Sign-in was cancelled or refused. Try again.'
    return /^[a-z0-9_]{1,60}$/.test(code)
      ? `Sign-in did not finish (${code}). Try again.`
      : 'Sign-in did not finish. Try again.'
  }
  return null
}

/**
 * The same address without a failed return's keys, as `search` and `hash`, so that a
 * reload does not say it again. Everything else in the address is kept.
 */
export function withoutReturnError(search: string, hash: string): { search: string; hash: string } {
  const [inHash, inSearch] = returnParams(search, hash)
  const failed = (p: URLSearchParams) => p.has('error_code') || p.has('error_description')
  const strip = (p: URLSearchParams) => {
    if (failed(p)) for (const key of RETURN_KEYS) p.delete(key)
    return p.toString()
  }
  // A fragment that is not a failed return (`#k=…`, `#slide-3`) is somebody else's and is
  // handed back as it came, not re-encoded.
  const nextHash = failed(inHash) ? strip(inHash) : hash.replace(/^#/, '')
  const nextSearch = failed(inSearch) ? strip(inSearch) : search.replace(/^\?/, '')
  return {
    search: nextSearch ? `?${nextSearch}` : '',
    hash: nextHash ? `#${nextHash}` : '',
  }
}
