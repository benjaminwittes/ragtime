import { describe, expect, it } from 'vitest'

import {
  CONSENT_PATH,
  consentReturnUrl,
  consentStep,
  hostOf,
  isConsentPath,
  readAuthorizationId,
  whoPaysInWords,
} from './oauth-consent.ts'

describe('isConsentPath', () => {
  it('is the consent page, with or without a query or a fragment', () => {
    expect(CONSENT_PATH).toBe('/oauth/consent')
    expect(isConsentPath('/oauth/consent')).toBe(true)
    expect(isConsentPath('/oauth/consent?authorization_id=abc')).toBe(true)
    expect(isConsentPath('/oauth/consent#access_token=abc')).toBe(true)
  })

  it('is no other page', () => {
    for (const other of ['/', '/explorer', '/oauth', '/oauth/consent/', '/oauth/consented', '/corpus/olc']) {
      expect(isConsentPath(other)).toBe(false)
    }
  })
})

describe('readAuthorizationId', () => {
  it('reads the id the server appended', () => {
    expect(readAuthorizationId('?authorization_id=abc-123')).toBe('abc-123')
    expect(readAuthorizationId('?x=1&authorization_id=%20abc%20')).toBe('abc')
  })

  it('is null when there is none, or it is blank', () => {
    expect(readAuthorizationId('')).toBeNull()
    expect(readAuthorizationId('?authorization_id=')).toBeNull()
    expect(readAuthorizationId('?authorization_id=%20')).toBeNull()
    expect(readAuthorizationId('?code=abc')).toBeNull()
  })
})

describe('consentReturnUrl', () => {
  it('is this page with the same authorization, which the page reads back', () => {
    const url = consentReturnUrl('https://ragtime.example/oauth/consent', 'a b/c')
    expect(url).toBe('https://ragtime.example/oauth/consent?authorization_id=a%20b%2Fc')
    expect(readAuthorizationId(new URL(url).search)).toBe('a b/c')
  })
})

describe('hostOf', () => {
  it('is the host of a redirect address, or the string when it is not one', () => {
    expect(hostOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai')
    expect(hostOf('not a url')).toBe('not a url')
  })
})

describe('consentStep', () => {
  const signedOut = { ready: true, signedIn: false, googleRequired: false, billingSettled: false, hasDetails: false }
  const signedIn = { ready: true, signedIn: true, googleRequired: false, billingSettled: true, hasDetails: true }

  it('waits until the session is known', () => {
    expect(consentStep({ ...signedOut, ready: false })).toBe('loading')
    expect(consentStep({ ...signedIn, ready: false })).toBe('loading')
  })

  it('signed out: the sign-in form', () => {
    expect(consentStep(signedOut)).toBe('sign-in')
  })

  it('signed in, with the request and the account both known: Approve or Deny', () => {
    expect(consentStep(signedIn)).toBe('decide')
  })

  it('signed in but still waiting on either: no Approve yet', () => {
    expect(consentStep({ ...signedIn, hasDetails: false })).toBe('checking')
    expect(consentStep({ ...signedIn, billingSettled: false })).toBe('checking')
  })

  it('a session that must be made by Google is offered Google, and never Approve', () => {
    expect(consentStep({ ...signedIn, googleRequired: true })).toBe('google-required')
    expect(consentStep({ ...signedIn, googleRequired: true, hasDetails: false, billingSettled: false })).toBe('google-required')
  })

  it('a signed-out page never says google-required: there is no session to refuse', () => {
    expect(consentStep({ ...signedOut, googleRequired: true })).toBe('sign-in')
  })
})

describe('whoPaysInWords', () => {
  it('says who pays when the service said, and both when it did not', () => {
    expect(whoPaysInWords('org')).toBe('AI calls on this account are paid for by Lawfare.')
    expect(whoPaysInWords('self')).toBe('AI calls are billed to your RAGtime balance.')
    expect(whoPaysInWords(null)).toContain('RAGtime balance')
    expect(whoPaysInWords(null)).toContain('Lawfare')
  })
})
