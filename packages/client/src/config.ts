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

/**
 * What a request says about where it came from, for the worker's telemetry: three
 * headers the worker keeps only as labels (`client` and `surface` lower-cased to
 * `[a-z0-9_.:-]` and cut at 64 characters, `interaction` at 128), never a credential
 * and nothing of the body. `client` names the program (`ragtime-web`, `wb`, the
 * connector); `surface` the page or verb the request serves; `interaction` an id that
 * joins the requests of one thing the reader did — a plan and its execute, a search
 * and its snippets — so the console can show that thing rather than a request.
 */
export type RequestTags = {
  client?: string
  surface?: string
  interaction?: string
}

/** Tags as a value, or as a function read at call time (a surface follows the route). */
export type TagsSource = RequestTags | (() => RequestTags)

export const CLIENT_HEADER = 'x-rt-client'
export const SURFACE_HEADER = 'x-rt-surface'
export const INTERACTION_HEADER = 'x-rt-interaction'

let tags: TagsSource = {}

/**
 * Point the package at a worker (a local `wrangler dev`, a preview, production), and
 * say what every request should carry about its origin. Either half may be given
 * alone; the other keeps its value.
 */
export function configureWorkerClient(opts: { baseUrl?: string; tags?: TagsSource }): void {
  if (opts.baseUrl !== undefined) {
    const base = opts.baseUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//.test(base)) {
      throw new Error(`configureWorkerClient: baseUrl must be an http(s) origin, got "${opts.baseUrl}"`)
    }
    current = base
  }
  if (opts.tags !== undefined) tags = opts.tags
}

/** The tag headers for one request, read now; a tag with no value is not sent. */
export function tagHeaders(): Record<string, string> {
  const t = typeof tags === 'function' ? tags() : tags
  const out: Record<string, string> = {}
  if (t.client) out[CLIENT_HEADER] = t.client
  if (t.surface) out[SURFACE_HEADER] = t.surface
  if (t.interaction) out[INTERACTION_HEADER] = t.interaction
  return out
}

/**
 * `fetch` with the tag headers on: what every corpus function in `worker-client.ts`
 * calls instead of the global, so the tags ride every request without each of a
 * hundred sites naming them. A header the caller set wins over a tag. Reads
 * `globalThis.fetch` at call time, so a test that replaces the global still sees
 * the request.
 */
export function workerFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const given = init?.headers
  if (given instanceof Headers || Array.isArray(given)) {
    const merged = new Headers(given)
    for (const [name, value] of Object.entries(tagHeaders())) if (!merged.has(name)) merged.set(name, value)
    return globalThis.fetch(input, { ...init, headers: merged })
  }
  return globalThis.fetch(input, { ...init, headers: { ...tagHeaders(), ...(given ?? {}) } })
}
