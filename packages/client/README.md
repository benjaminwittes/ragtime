# @lawfare/ragtime-client

The one owner of the connection to the RAGtime worker for the browser UXs. Framework-free:
`fetch` is the only platform call. React glue stays per app.

Install: `npm install @lawfare/ragtime-client`. Published from `packages/client` of
[benjaminwittes/ragtime](https://github.com/benjaminwittes/ragtime) under MIT; ES module only,
types included.

```ts
import { createClient } from '@lawfare/ragtime-client'

const client = createClient({
  baseUrl: 'http://127.0.0.1:8787',                 // a local wrangler dev; production by default
  auth: { mode: 'demo', model: 'claude-haiku-4-5', password },
})

const registry = await client.registry()            // GET /corpus/registry, typed

let messages = [{ role: 'user', content: 'Which OLC opinions address removal without cause?' }]
let envelope: string | null = null

for await (const ev of client.explorer.turn({ phase: 'orient', messages, envelope })) {
  switch (ev.type) {
    case 'text':        render(ev.delta); break
    case 'tool_call':   trail.call(ev); break
    case 'tool_result': trail.result(ev); break
    case 'handoff':     if (ev.kind === 'workspace') trail.handoff(ev); break
    case 'cost':        meter.set(ev); break
    case 'phase':       if (ev.outcome === 'brief') briefCard.show(ev.brief); break
    case 'done':        ({ messages, envelope } = continueFrom(messages, ev)); break
  }
}

client.links.document({ slug: 'olc', id: 50 })      // '/corpus/olc/50'
client.links.fromCitation('rt://olc/50')            // the same; the only resolver of rt://
client.links.workspace({ slug: 'olc', q: 'removal' })
client.links.parse('/corpus/olc?q=removal')         // the only reader
```

## What is in it

| Module | What |
|---|---|
| `worker-client.ts` | Every typed wrapper the public frontend's `app/src/lib/worker-client.ts` has, lifted as one file. Three edits: two path-alias imports made relative, the `Provider` union copied out of a React context, and the Vite environment read for the worker URL replaced by `workerUrl()`. |
| `auth-arg.ts` | The `AuthArg` discriminated union (BYOK / paid / demo) and the body and header builders, unchanged. |
| `corpus-types.ts` | The frontend's `spokes/types.ts`: `CorpusSlug` and the spoke descriptor types, unchanged. |
| `explorer.ts` | `POST /explorer/turn` as `AsyncIterable<ExplorerEvent>` — one variant per event name in the contract — plus `runExplorerTurn` (the same turn, collected) and `continueFrom`. |
| `registry.ts` | `GET /corpus/registry`, typed. |
| `links.ts` | The deep-link grammar: `workspace`, `document`, `fromCitation`, `parseCitation`, and `parse`, the one reader. Byte-for-byte what the worker emits in `handoff` events for the same inputs. |
| `config.ts` | Where the worker is. |

## One worker URL per loaded module

`createClient({ baseUrl })` configures the module; every function in `worker-client.ts` reads
it at call time. A second `createClient` with a different `baseUrl` reconfigures all of them,
not just its own handle. That is the lift's honest limit: the corpus functions were written
against a module constant, and threading a client through a hundred call sites is the step
past two consumers, along with an OpenAPI description of the worker.

## Running it

```sh
npm install            # at the repo root
npm run check -w @lawfare/ragtime-client     # tsc --strict, sources and tests
npm test -w @lawfare/ragtime-client          # node --test; no network
```

The live test drives one orient turn against a running endpoint (about a cent of the
explorer credential's daily bucket). It is skipped unless asked for:

```sh
EXPLORER_LIVE=1 op run --env-file=.env.op -- node --test test/live.test.ts          # local wrangler dev on :8787
EXPLORER_BASE=https://ragtimeproxy.benjamin-wittes.workers.dev EXPLORER_LIVE=1 …    # the deployed worker
```

Node 22.18+ runs the TypeScript tests directly (type stripping); the sources use only
erasable syntax so the same files build with `tsc` to `dist/` for consumers.

`tool_result` carries `detail` beside the one-line `summary` (item 5 of the design answers
on ragtime-dev#168, contract §9 row 9): `ExplorerToolDetail`, one variant per tool family —
`search` (a hit count per corpus, zero or not, with the top titles), `documents` (a title per
fetched id, text length in full mode), `facets` (field count, document count, facet groups),
`plan`, `answer`, or `text`. The worker renders `summary` from the same object. The field is
optional in the type because a worker deployed before it omits it and a failed result never
has one.

## Resolving the package inside this repo

`exports` points consumers at `dist/`. Inside the monorepo the `development` export
condition points at `src/` instead, so Vite's dev server (which asks for that condition) and
`node --conditions=development --test` both run the sources without a build step; `vite build`
and any outside consumer read `dist/`, which `npm run build` at the root emits first.

## Contract

Built to the page frozen 2026-09-08 on benjaminwittes/ragtime-dev#168 (§4 the event stream and
its four ordering rules, §5 the deep-link grammar, §7 this package's surface). Deviations the
worker recorded when it was built are additive and typed here: exact `spend` beside integer
`cents`, `calls` on `done`, a second `phase` event carrying the orient outcome.
