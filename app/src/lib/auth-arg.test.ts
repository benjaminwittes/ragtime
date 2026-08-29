import { describe, expect, it } from 'vitest'
import { authBody, authCredentialBody, authHeaders, type AuthArg } from './auth-arg'

// These three functions decide which credential goes where on every billed
// call. The invariants worth pinning are mostly negative — what must NOT end up
// in a body or a header — because those are the failures that leak a key or
// bill the wrong account, and they are invisible in a passing UI.

const byok: AuthArg = { mode: 'byok', provider: 'openai', model: 'gpt-x', apiKey: 'sk-secret' }
const paid: AuthArg = { mode: 'paid', model: 'claude-x', sessionToken: 'jwt-token' }
const demo: AuthArg = { mode: 'demo', model: 'claude-x', password: 'demo-pw' }

describe('authBody', () => {
  it('carries provider, model and the user key for BYOK', () => {
    expect(authBody(byok)).toEqual({
      provider: 'openai',
      model: 'gpt-x',
      user_api_key: 'sk-secret',
    })
  })

  // The Worker enforces Anthropic on both the demo and paid paths. If the
  // client ever sent the user's chosen provider here instead, the request would
  // be rejected at the edge for reasons no UI copy explains.
  it('forces provider to anthropic for demo and paid, whatever the model', () => {
    expect(authBody(demo).provider).toBe('anthropic')
    expect(authBody(paid).provider).toBe('anthropic')
  })

  it('sends the shared password for demo and never a user key', () => {
    const body = authBody(demo)
    expect(body.password).toBe('demo-pw')
    expect(body).not.toHaveProperty('user_api_key')
  })

  // Paid auth travels in the Authorization header. A session JWT in the request
  // body would be logged wherever bodies are logged.
  it('puts no credential in the body for paid', () => {
    const body = authBody(paid)
    expect(body).toEqual({ provider: 'anthropic', model: 'claude-x' })
    expect(body).not.toHaveProperty('sessionToken')
    expect(body).not.toHaveProperty('password')
    expect(body).not.toHaveProperty('user_api_key')
  })
})

describe('authCredentialBody', () => {
  // The execute leg re-sends only the credential: provider and model are
  // already fixed by the plan token, and resending them invites drift between
  // what was planned and what was billed.
  it('re-sends only the credential, never provider or model', () => {
    expect(authCredentialBody(byok)).toEqual({ user_api_key: 'sk-secret' })
    expect(authCredentialBody(demo)).toEqual({ password: 'demo-pw' })
  })

  it('contributes nothing for paid, which carries its JWT in the header', () => {
    expect(authCredentialBody(paid)).toEqual({})
  })
})

describe('authHeaders', () => {
  it('always sets the JSON content type', () => {
    for (const auth of [byok, paid, demo]) {
      expect(authHeaders(auth)['content-type']).toBe('application/json')
    }
  })

  it('adds the Bearer token for paid only', () => {
    expect(authHeaders(paid)['Authorization']).toBe('Bearer jwt-token')
    expect(authHeaders(byok)).not.toHaveProperty('Authorization')
    expect(authHeaders(demo)).not.toHaveProperty('Authorization')
  })

  // A BYOK key belongs in the body, where the Worker's resolveCorpusAuth reads
  // it. Headers are the likelier thing to be captured by a proxy or a log.
  it('never puts the BYOK key or demo password in a header', () => {
    expect(JSON.stringify(authHeaders(byok))).not.toContain('sk-secret')
    expect(JSON.stringify(authHeaders(demo))).not.toContain('demo-pw')
  })

  it('returns a fresh object each call, so callers cannot poison the next one', () => {
    const first = authHeaders(byok)
    first['X-Injected'] = 'nope'
    expect(authHeaders(byok)).not.toHaveProperty('X-Injected')
  })
})
