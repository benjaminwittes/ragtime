/**
 * What the Explorer page is built knowing. On its own site the page kept a settings
 * dialog for the worker origin, the site links opened on, and a pasted password; here the
 * app owns all three — the worker origin is the app's, links are the app's own routes
 * (`@/lib/routing`), and the credential is whatever `useAuth()` resolves.
 */

/**
 * The worker origin, the same one every corpus call in the app is built on — re-exported
 * rather than re-derived, because "the same one" was a claim this file used to make by
 * repeating the environment read and hoping (`@/lib/worker-url`).
 */
export { WORKER_URL } from '@/lib/worker-url'
