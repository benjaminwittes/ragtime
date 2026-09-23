/**
 * Where the worker is.
 *
 * The public frontend read this from a Vite environment variable at module
 * load. Here it is a value `createClient({ baseUrl })` sets, and every
 * corpus function in `worker-client.ts` reads it through `workerUrl()` at
 * call time. One worker URL per loaded module: a second `createClient` with
 * a different `baseUrl` reconfigures every function, not just its own
 * handle. That is the lift's honest limit — the corpus functions were
 * written against a module constant, and threading a client through a
 * hundred call sites is the step past two consumers (an OpenAPI description
 * of the worker), not this one.
 */

export const DEFAULT_WORKER_URL = 'https://ragtimeproxy.benjamin-wittes.workers.dev'

let current = DEFAULT_WORKER_URL

/** The worker origin every request in this package is built on. No trailing slash. */
export function workerUrl(): string {
  return current
}

/** Point the package at a worker (a local `wrangler dev`, a preview, production). */
export function configureWorkerClient(opts: { baseUrl: string }): void {
  const base = opts.baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) {
    throw new Error(`configureWorkerClient: baseUrl must be an http(s) origin, got "${opts.baseUrl}"`)
  }
  current = base
}
