import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client singleton — talks to the APP project (the small one that
 * holds auth, accounts, billing). Per CLAUDE.md the corpus project is
 * separate; corpus data never goes through this client. Paid-tier auth and
 * /api/balance only.
 *
 * The publishable key and URL match the legacy `index.html` boot path —
 * these are not secrets (publishable key has anon role only; URL is the
 * project's public DNS). We hardcode them as constants here so the build
 * works without env config; production already runs against this project,
 * so a separate env layer adds friction without changing the actual
 * target.
 *
 * There is now a second auth project: the staging Worker verifies tokens
 * from the accounts project, not APP, so a local app pointed at staging
 * (`VITE_WORKER_URL`) must also sign in there, or every signed-in call is
 * refused for a token from the wrong issuer. `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_PUBLISHABLE_KEY` override the pair together, same shape as
 * `VITE_WORKER_URL`; unset, the build is exactly what it was.
 *
 * `detectSessionInUrl: true` is the bit that picks up the magic-link
 * fragment when the user lands back on the app after clicking the email.
 * `persistSession` + `autoRefreshToken` keep them signed in across reloads
 * and refresh expired JWTs on the fly. Same posture as the legacy app.
 */

export const APP_PROJECT_URL = 'https://aikdbjprndgksibbvcfs.supabase.co'
export const APP_PROJECT_PUBLISHABLE_KEY = 'sb_publishable_I8b_IXrRGR-bu3wOMEox5g_X9NllzgB'

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || APP_PROJECT_URL
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  APP_PROJECT_PUBLISHABLE_KEY

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}
