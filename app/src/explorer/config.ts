import { DEFAULT_WORKER_URL } from '@lawfare/ragtime-client'

/**
 * What the Explorer page is built knowing. On its own site the page kept a settings
 * dialog for the worker origin, the site links opened on, and a pasted password; here the
 * app owns all three — the worker origin is the app's, links are the app's own routes
 * (`@/lib/routing`), and the credential is whatever `useAuth()` resolves.
 */

/** The worker origin, the same one every corpus call in the app is built on. No trailing slash. */
export const WORKER_URL = ((import.meta.env.VITE_WORKER_URL as string | undefined) || DEFAULT_WORKER_URL).replace(/\/+$/, '')

/**
 * The daily allowance on model calls for a caller without a paid account:
 * `IP_DAILY_MODEL_CALLS` in the worker's `explorer.js`, counted per address per UTC day.
 *
 * Stated here so the page can say what the limit is before a turn has told it. A `cost`
 * event carrying `ip_cap` supersedes it, and is the number to believe; this one only has
 * to be right on the first screen a member sees. If the worker's constant moves, this
 * follows it.
 */
export const DAILY_MODEL_CALLS = 60

/**
 * Where a note about this page goes (`model/point.ts`), named at build time. Empty — the
 * default — draws no widget at all: a page with nowhere honest to file a note is better
 * off without a button that fails.
 */
export const POINT_URL = ((import.meta.env.VITE_POINT_URL as string | undefined) || '').trim()
