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
 * target. If we ever stand up a dev APP project, this is the single line
 * to override.
 *
 * `detectSessionInUrl: true` is the bit that picks up the magic-link
 * fragment when the user lands back on the app after clicking the email.
 * `persistSession` + `autoRefreshToken` keep them signed in across reloads
 * and refresh expired JWTs on the fly. Same posture as the legacy app.
 */

const APP_PROJECT_URL = 'https://aikdbjprndgksibbvcfs.supabase.co'
const APP_PROJECT_PUBLISHABLE_KEY = 'sb_publishable_I8b_IXrRGR-bu3wOMEox5g_X9NllzgB'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(APP_PROJECT_URL, APP_PROJECT_PUBLISHABLE_KEY, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}
