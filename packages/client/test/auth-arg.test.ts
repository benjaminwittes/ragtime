import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { authBody, authCredentialBody, authHeaders, type AuthArg } from '../src/auth-arg.ts'

// These three functions decide which credential goes where on every billed
// call. The invariants worth pinning are mostly negative — what must NOT end up
// in a body or a header — because those are the failures that leak a key or
// bill the wrong account, and they are invisible in a passing UI.
//
// Lived in the public frontend as `app/src/lib/auth-arg.test.ts` until the app's
// copy of this module was deleted in favour of the package's. It moved here with
// the code rather than staying behind it: this package is published, and a
// consumer running its tests was getting no coverage of the credential path at
// all — the app's suite only happened to cover it by importing it.

const byok: AuthArg = { mode: 'byok', provider: 'openai', model: 'gpt-x', apiKey: 'sk-secret' }
const paid: AuthArg = { mode: 'paid', model: 'claude-x', sessionToken: 'jwt-token' }
const demo: AuthArg = { mode: 'demo', model: 'claude-x', password: 'demo-pw' }

describe('authBody', () => {
  it('carries provider, model and the user key for BYOK', () => {
    assert.deepEqual(authBody(byok), {
      provider: 'openai',
      model: 'gpt-x',
      user_api_key: 'sk-secret',
    })
  })

  // The Worker enforces Anthropic on both the demo and paid paths. If the
  // client ever sent the user's chosen provider here instead, the request would
  // be rejected at the edge for reasons no UI copy explains.
  it('forces provider to anthropic for demo and paid, whatever the model', () => {
    assert.equal(authBody(demo).provider, 'anthropic')
    assert.equal(authBody(paid).provider, 'anthropic')
  })

  it('sends the shared password for demo and never a user key', () => {
    const body = authBody(demo)
    assert.equal(body.password, 'demo-pw')
    assert.ok(!('user_api_key' in body))
  })

  // Paid auth travels in the Authorization header. A session JWT in the request
  // body would be logged wherever bodies are logged.
  it('puts no credential in the body for paid', () => {
    const body = authBody(paid)
    assert.deepEqual(body, { provider: 'anthropic', model: 'claude-x' })
    assert.ok(!('sessionToken' in body))
    assert.ok(!('password' in body))
    assert.ok(!('user_api_key' in body))
  })
})

describe('authCredentialBody', () => {
  // The execute leg re-sends only the credential: provider and model are
  // already fixed by the plan token, and resending them invites drift between
  // what was planned and what was billed.
  it('re-sends only the credential, never provider or model', () => {
    assert.deepEqual(authCredentialBody(byok), { user_api_key: 'sk-secret' })
    assert.deepEqual(authCredentialBody(demo), { password: 'demo-pw' })
  })

  it('contributes nothing for paid, which carries its JWT in the header', () => {
    assert.deepEqual(authCredentialBody(paid), {})
  })
})

describe('authHeaders', () => {
  it('always sets the JSON content type', () => {
    for (const auth of [byok, paid, demo]) {
      assert.equal(authHeaders(auth)['content-type'], 'application/json')
    }
  })

  it('adds the Bearer token for paid only', () => {
    assert.equal(authHeaders(paid)['Authorization'], 'Bearer jwt-token')
    assert.ok(!('Authorization' in authHeaders(byok)))
    assert.ok(!('Authorization' in authHeaders(demo)))
  })

  // A BYOK key belongs in the body, where the Worker's resolveCorpusAuth reads
  // it. Headers are the likelier thing to be captured by a proxy or a log.
  it('never puts the BYOK key or demo password in a header', () => {
    assert.ok(!JSON.stringify(authHeaders(byok)).includes('sk-secret'))
    assert.ok(!JSON.stringify(authHeaders(demo)).includes('demo-pw'))
  })

  it('returns a fresh object each call, so callers cannot poison the next one', () => {
    const first = authHeaders(byok)
    first['X-Injected'] = 'nope'
    assert.ok(!('X-Injected' in authHeaders(byok)))
  })
})
