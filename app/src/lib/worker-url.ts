/**
 * Where the worker is, read once and told to the client package.
 *
 * The app used to answer this question in four places — `lib/worker-client.ts`,
 * `lib/usage-log.ts`, `auth/paid-context.tsx` and `explorer/config.ts` each read
 * `VITE_WORKER_URL` and each fell back to the production origin spelled out in full. Four
 * copies of one fact is four places for a dev pointing at a local `wrangler dev` to be
 * half-redirected, which is worse than not being redirected at all: some calls go to the
 * local worker and some to production, and the page looks like it is working.
 *
 * `@lawfare/ragtime-client` reads its origin through `workerUrl()` at call time rather
 * than from a module constant, so it has to be *told* — and the telling has to happen
 * before any module body can make a corpus call. That is why this module configures on
 * import and why `main.tsx` imports it first, as a bare side-effect import: ES modules
 * evaluate their imports depth-first in source order, so a statement in `main.tsx`'s body
 * would run after every other module had already been evaluated. Nothing in the app calls
 * the worker at module-evaluation time today, and this arrangement means nothing has to
 * keep not doing so.
 */

import { DEFAULT_WORKER_URL, configureWorkerClient } from '@lawfare/ragtime-client'

/** The worker origin every call in the app is built on. No trailing slash. */
export const WORKER_URL = ((import.meta.env.VITE_WORKER_URL as string | undefined) || DEFAULT_WORKER_URL).replace(/\/+$/, '')

configureWorkerClient({ baseUrl: WORKER_URL })
