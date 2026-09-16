/**
 * Against a running endpoint — a local `wrangler dev` by default, or the
 * deployed worker with EXPLORER_BASE. Skipped unless EXPLORER_LIVE=1; needs
 * DEMO_PASSWORD_EXPLORER in the environment (inject it, never paste it):
 *
 *   EXPLORER_LIVE=1 op run --env-file=.env.op -- node --test test/live.test.ts
 *   EXPLORER_LIVE=1 node --env-file=path/to/.dev.vars --test test/live.test.ts
 *
 * One orient turn costs about a cent of the explorer credential's daily bucket.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createClient } from '../src/index.ts'
import type { ExplorerEvent } from '../src/explorer.ts'

const live = process.env.EXPLORER_LIVE === '1'
const password = process.env.DEMO_PASSWORD_EXPLORER
const base = process.env.EXPLORER_BASE || 'http://127.0.0.1:8787'
const skip = live ? false : 'set EXPLORER_LIVE=1 (and DEMO_PASSWORD_EXPLORER) to run against an endpoint'

test('the registry answers', { skip }, async () => {
  const client = createClient({ baseUrl: base })
  const reg = await client.registry()
  assert.ok(reg.count > 0)
  assert.equal(reg.corpora.length, reg.count)
  assert.ok(reg.corpora.some((c) => c.slug === 'olc'))
  assert.ok(reg.lists.hub.length > 0)
  assert.match(reg.version, /^[0-9a-f]{8}$/)
})

test('one orient turn obeys the four ordering rules and returns an envelope', { skip }, async () => {
  assert.ok(password, 'DEMO_PASSWORD_EXPLORER is required')
  const client = createClient({ baseUrl: base, auth: { mode: 'demo', model: 'claude-haiku-4-5', password } })
  const types: ExplorerEvent['type'][] = []
  const r = await client.explorer.run(
    {
      phase: 'orient',
      messages: [{ role: 'user', content: 'Which OLC opinions discuss whether the President can remove the head of an independent agency without cause?' }],
    },
    (ev) => types.push(ev.type),
  )
  const seen = types.filter((t) => t !== 'keepalive')
  assert.equal(seen[0], 'phase', 'rule 1: phase first')
  assert.equal(seen[seen.length - 1], 'done', 'rule 3: done last')
  assert.equal(seen[seen.length - 2], 'cost', 'rule 2: cost precedes done')
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] !== 'tool_result') continue
    let j = i + 1
    while (seen[j] === 'handoff') j++
    assert.equal(seen[j], 'cost', 'rule 2: cost follows every tool_result')
  }
  assert.ok(r.done, 'a done event')
  assert.equal(typeof r.done?.envelope, 'string')
  assert.ok((r.done?.calls ?? 0) >= 1)
  assert.ok(r.done?.history.length, 'history to append')
  assert.ok(r.outcome, 'an orient outcome')
  assert.ok(r.outcome?.outcome === 'brief' || r.outcome?.outcome === 'question')
  assert.ok(r.cost && r.cost.conversation_spend > 0)
})
