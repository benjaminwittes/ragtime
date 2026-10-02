/**
 * OAuth consent helpers — pure functions, no DOM, so they can be reasoned
 * about (and tested) apart from the page in `OAuthConsent.tsx`.
 *
 * The auth project's OAuth 2.1 server sends a person here when a client
 * (Claude, through the RAGtime MCP connector) asks to act as that person. The
 * server appends `?authorization_id=<id>`; the page shows who is asking and
 * records the decision through supabase-js.
 */

/** Logical route of the consent page (the dashboard's "Authorization Path"). */
export const CONSENT_PATH = '/oauth/consent'

/** True when the logical path is the consent page; query string and hash ignored. */
export function isConsentPath(logicalPath: string): boolean {
  return logicalPath.split('?')[0].split('#')[0] === CONSENT_PATH
}

/** The `authorization_id` the server appended, or null when absent or blank. */
export function readAuthorizationId(search: string): string | null {
  const v = new URLSearchParams(search).get('authorization_id')
  return v && v.trim() ? v.trim() : null
}

/**
 * Where a sign-in must bring the person back, from the email link and from
 * Google alike: this same page, with the same authorization, so the flow
 * resumes where it paused. (The app's general sign-in returns to the bare
 * path and drops the query string, which would strand the flow.)
 */
export function consentReturnUrl(pageUrl: string, authorizationId: string): string {
  return `${pageUrl}?authorization_id=${encodeURIComponent(authorizationId)}`
}

/** Host of a redirect URI, for display; the raw string if it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * What the page shows.
 *
 *   loading          the session is not yet known
 *   sign-in          no session: the Google button and the email form
 *   google-required  a session the service refuses because its address must
 *                    sign in with Google; approving would connect an account
 *                    that cannot ask anything, so the page offers Google
 *   checking         signed in; waiting to learn what is being asked for, and
 *                    for the service to say who pays
 *   decide           Approve or Deny
 *
 * The page waits for the service's answer about the account (`billingSettled`)
 * before offering Approve. That answer is where a first Google sign-in from an
 * organisation's address is given its membership, so by the time a person can
 * approve, the account the client will act as is already set up. An answer
 * that failed counts as settled: a service that cannot be reached must not
 * hold the page.
 */
export type ConsentStep = 'loading' | 'sign-in' | 'google-required' | 'checking' | 'decide'

export function consentStep(s: {
  ready: boolean
  signedIn: boolean
  googleRequired: boolean
  billingSettled: boolean
  hasDetails: boolean
}): ConsentStep {
  if (!s.ready) return 'loading'
  if (!s.signedIn) return 'sign-in'
  if (s.googleRequired) return 'google-required'
  if (!s.hasDetails || !s.billingSettled) return 'checking'
  return 'decide'
}

/** Who pays for what the client does, in one sentence, from what the service said. */
export function whoPaysInWords(billing: 'self' | 'org' | null): string {
  if (billing === 'org') return 'AI calls on this account are paid for by Lawfare.'
  if (billing === 'self') return 'AI calls are billed to your RAGtime balance.'
  return 'AI calls are billed to your RAGtime balance, or paid for by Lawfare when the account is covered.'
}
