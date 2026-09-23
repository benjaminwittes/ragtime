/**
 * @lawfare/ragtime-client — the one owner of the connection to the RAGtime worker
 * for the browser UXs (the public frontend, Explorer, whatever comes next).
 *
 *   createClient({ baseUrl, auth })
 *     .registry()                  GET /corpus/registry, typed
 *     .explorer.turn(req)          POST /explorer/turn as AsyncIterable<ExplorerEvent>
 *     .explorer.run(req, onEvent)  the same turn, collected
 *     .links                       the deep-link grammar: workspace / document / fromCitation / parse
 *
 * Every export the public frontend's worker-client.ts had is re-exported
 * unchanged (contract §7, frozen 2026-09-08 on ragtime-dev#168). Framework-free:
 * `fetch` is the only platform call. React glue stays per app.
 */

import type { AuthArg } from './auth-arg.ts'
import { configureWorkerClient, workerUrl } from './config.ts'
import {
  explorerTurn,
  runExplorerTurn,
  type ExplorerEvent,
  type ExplorerTurnOptions,
  type ExplorerTurnRequest,
  type ExplorerTurnResult,
} from './explorer.ts'
import { links } from './links.ts'
import { fetchRegistry, type CorpusRegistry } from './registry.ts'

export * from './auth-arg.ts'
export * from './corpus-types.ts'
export * from './worker-client.ts'
export * from './explorer.ts'
export * from './registry.ts'
export { DEFAULT_WORKER_URL, configureWorkerClient, workerUrl } from './config.ts'
export {
  links,
  LINK_MODES,
  RESERVED_PARAMS,
  type LinkMode,
  type WorkspaceLink,
  type DocumentLink,
  type ParsedLink,
} from './links.ts'

export type ClientOptions = {
  /** The worker origin. Defaults to production; a local `wrangler dev` is `http://127.0.0.1:8787`. */
  baseUrl?: string
  /** Used by every billed call that is not given its own. */
  auth?: AuthArg
  /** Injectable for tests; defaults to the global. */
  fetch?: typeof globalThis.fetch
}

export type RagtimeClient = {
  readonly baseUrl: string
  registry(): Promise<CorpusRegistry>
  explorer: {
    turn(req: ExplorerTurnRequest, auth?: AuthArg, opts?: ExplorerTurnOptions): AsyncGenerator<ExplorerEvent, void, undefined>
    run(
      req: ExplorerTurnRequest,
      onEvent?: (ev: ExplorerEvent) => void,
      auth?: AuthArg,
      opts?: ExplorerTurnOptions,
    ): Promise<ExplorerTurnResult>
  }
  links: typeof links
}

export function createClient(options: ClientOptions = {}): RagtimeClient {
  if (options.baseUrl) configureWorkerClient({ baseUrl: options.baseUrl })
  const defaultAuth = options.auth
  const resolveAuth = (auth?: AuthArg): AuthArg => {
    const a = auth ?? defaultAuth
    if (!a) throw new Error('createClient: this call needs an AuthArg — pass one here or to createClient({ auth })')
    return a
  }
  const withFetch = (opts?: ExplorerTurnOptions): ExplorerTurnOptions => {
    const out: ExplorerTurnOptions = { ...opts }
    if (!out.fetch && options.fetch) out.fetch = options.fetch
    return out
  }
  return {
    get baseUrl() {
      return workerUrl()
    },
    registry: () => fetchRegistry(options.fetch ? { fetch: options.fetch } : {}),
    explorer: {
      turn: (req, auth, opts) => explorerTurn(req, resolveAuth(auth), withFetch(opts)),
      run: (req, onEvent, auth, opts) => runExplorerTurn(req, resolveAuth(auth), onEvent, withFetch(opts)),
    },
    links,
  }
}
