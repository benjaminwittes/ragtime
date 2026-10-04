import { describe, expect, it } from 'vitest'

import {
  GOOGLE_ONLY_DOMAINS,
  GOOGLE_REQUIRED,
  isGoogleRequired,
  mustUseGoogle,
  offersGoogle,
  refusalInWords,
  returnErrorIn,
  withoutReturnError,
} from './sign-in.ts'

describe('mustUseGoogle', () => {
  it('names one domain, and one sentence', () => {
    expect(GOOGLE_ONLY_DOMAINS).toEqual(['lawfaremedia.org'])
    expect(GOOGLE_REQUIRED).toBe('Lawfare addresses sign in with Google.')
  })

  it('is yes for an address on the domain when Google is on, however it is typed', () => {
    expect(mustUseGoogle('reader@lawfaremedia.org', true)).toBe(true)
    expect(mustUseGoogle('Reader@LawfareMedia.ORG', true)).toBe(true)
    expect(mustUseGoogle('  reader@lawfaremedia.org  ', true)).toBe(true)
    expect(mustUseGoogle('a@b@lawfaremedia.org', true)).toBe(true)
  })

  it('is no for every address when Google is off, so nobody is locked out', () => {
    expect(mustUseGoogle('reader@lawfaremedia.org', false)).toBe(false)
    expect(mustUseGoogle('Reader@LawfareMedia.ORG', false)).toBe(false)
  })

  it('is no for any other domain, look-alikes and subdomains included', () => {
    for (const other of [
      'reader@example.org',
      'reader@lawfaremedia.org.example.com',
      'reader@mail.lawfaremedia.org',
      'reader@notlawfaremedia.org',
      'reader@lawfaremedia.com',
      'lawfaremedia.org@example.org',
    ]) {
      expect(mustUseGoogle(other, true)).toBe(false)
    }
  })

  it('is no for something that is not yet an address', () => {
    for (const partial of ['', 'reader', 'reader@', '@lawfaremedia.org', 'lawfaremedia.org', 'reader@lawfaremedia']) {
      expect(mustUseGoogle(partial, true)).toBe(false)
    }
  })
})

describe('isGoogleRequired', () => {
  const refusal = { error: { message: 'Lawfare addresses sign in with Google.', code: 'google_required' } }

  it('is yes for a 403 that carries the code', () => {
    expect(isGoogleRequired(403, refusal)).toBe(true)
  })

  it('goes by the code and not the words, and needs the 403', () => {
    expect(isGoogleRequired(403, { error: { message: 'Lawfare addresses sign in with Google.' } })).toBe(false)
    expect(isGoogleRequired(403, { error: { message: 'x', code: 'something_else' } })).toBe(false)
    expect(isGoogleRequired(402, refusal)).toBe(false)
    expect(isGoogleRequired(200, refusal)).toBe(false)
  })

  it('is no for a body that is not the shape', () => {
    for (const odd of [null, undefined, 'google_required', {}, { error: null }, { error: 'google_required' }, { code: 'google_required' }]) {
      expect(isGoogleRequired(403, odd)).toBe(false)
    }
  })
})

describe('offersGoogle', () => {
  it('is yes only when the project says Google is on', () => {
    expect(offersGoogle({ external: { google: true, email: true } })).toBe(true)
    expect(offersGoogle({ external: { google: false, email: true } })).toBe(false)
    expect(offersGoogle({ external: { email: true } })).toBe(false)
  })

  it('is no for anything that is not the settings shape', () => {
    for (const odd of [null, undefined, 'google', 1, [], {}, { external: null }, { external: { google: 'true' } }]) {
      expect(offersGoogle(odd)).toBe(false)
    }
  })
})

describe('refusalInWords', () => {
  const capped = { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 }

  it('says the hourly cap in words, and points at Google when it is offered', () => {
    expect(refusalInWords(capped, false)).toBe(
      'RAGtime can send only a few sign-in emails an hour, and this hour’s have gone. Try again in an hour.',
    )
    expect(refusalInWords(capped, true)).toContain('Continue with Google')
  })

  it('knows the cap by its status when there is no code', () => {
    expect(refusalInWords({ message: 'email rate limit exceeded', status: 429 }, false)).toContain('an hour')
  })

  it('keeps the message that already says how long to wait', () => {
    const soon = {
      message: 'For security purposes, you can only request this after 52 seconds.',
      code: 'over_email_send_rate_limit',
      status: 429,
    }
    expect(refusalInWords(soon, true)).toBe(soon.message)
  })

  it('leaves every other refusal as it came', () => {
    expect(refusalInWords({ message: 'Signups not allowed for otp', code: 'otp_disabled', status: 422 }, true)).toBe(
      'Signups not allowed for otp',
    )
  })
})

describe('returnErrorIn', () => {
  // What the auth server sends for a link that was opened twice, or opened first by a
  // mail scanner: the same three keys in the query and in the fragment.
  const expired = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

  it('is null on an ordinary address', () => {
    expect(returnErrorIn('', '')).toBeNull()
    expect(returnErrorIn('?q=habeas+corpus', '#k=some-passphrase')).toBeNull()
    expect(returnErrorIn('', '#access_token=abc&refresh_token=def&type=magiclink')).toBeNull()
  })

  it('says a used or expired link in our words, from the fragment or the query', () => {
    expect(returnErrorIn('', `#${expired}`)).toBe('That sign-in link has expired or was already used. Ask for a new one.')
    expect(returnErrorIn(`?${expired}`, '')).toBe('That sign-in link has expired or was already used. Ask for a new one.')
  })

  it('says a refusal at Google as a refusal', () => {
    expect(returnErrorIn('', '#error=access_denied&error_description=The+user+denied+access')).toBe(
      'Sign-in was cancelled or refused. Try again.',
    )
  })

  it('never repeats the description, which a link can set to anything', () => {
    const said = returnErrorIn('', '#error_code=bad_oauth_state&error_description=Call+this+number+to+unlock+your+account')
    expect(said).toBe('Sign-in did not finish (bad_oauth_state). Try again.')
    expect(returnErrorIn('', '#error_code=%3Cb%3Ehello%3C%2Fb%3E+there&error_description=x')).toBe(
      'Sign-in did not finish. Try again.',
    )
  })
})

describe('withoutReturnError', () => {
  it('takes the failed return out and keeps the rest', () => {
    expect(
      withoutReturnError(
        '?q=habeas&error=access_denied&error_code=otp_expired&error_description=x',
        '#error=access_denied&error_code=otp_expired&error_description=x',
      ),
    ).toEqual({ search: '?q=habeas', hash: '' })
  })

  it('hands back an address that carries no failed return exactly as it came', () => {
    expect(withoutReturnError('?q=a%20b&ids=1,2', '#k=pass+phrase')).toEqual({ search: '?q=a%20b&ids=1,2', hash: '#k=pass+phrase' })
    expect(withoutReturnError('', '')).toEqual({ search: '', hash: '' })
  })
})
