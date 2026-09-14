/**
 * OAuth consent helpers — pure functions, no DOM, so they can be reasoned
 * about (and tested) apart from the page in `OAuthConsent.tsx`.
 *
 * The APP Supabase project's OAuth 2.1 server sends a user here when a client
 * (Claude, through the RAGtime MCP connector) asks to act as that user. The
 * server appends `?authorization_id=<id>`; the page shows who is asking and
 * records the decision through supabase-js.
 */

/** Logical route of the consent page (the dashboard's "Authorization Path"). */
export const CONSENT_PATH = '/oauth/consent'

/** True when the logical path is the consent page; query string and hash ignored. */
export function isConsentPath(logicalPath: string): boolean {
  return logicalPath.split('?')[0].split('#')[0] === CONSENT_PATH
}

/** The `authorization_id` Supabase appended, or null when absent or blank. */
export function readAuthorizationId(search: string): string | null {
  const v = new URLSearchParams(search).get('authorization_id')
  return v && v.trim() ? v.trim() : null
}

/**
 * Where the magic-link email must bring the user back: this same page, with
 * the same authorization, so the flow resumes where it paused. (The app's
 * general sign-in drops the query string, which would strand the flow.)
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
