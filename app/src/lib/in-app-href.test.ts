/**
 * The rule that decides whether a link stays in the app or leaves it.
 *
 * Worth pinning rather than reading, because the inputs are not all ours: the Explorer's
 * own links are built by `links`, but an answer is markdown a model wrote, and the two
 * cases that matter — a protocol-relative host and a prefix that is not a whole segment —
 * both *look* like paths.
 *
 * No `@/` imports and no `import.meta.env` here: this file is also executed by
 * `ragtime-worker`'s vitest (app/vitest.config.ts, "Cross-repo caveat").
 */

import { describe, expect, it } from 'vitest'

import { inAppHref } from './in-app-href.ts'

describe('inAppHref, mounted at the root', () => {
  it('takes an origin-relative path', () => {
    expect(inAppHref('/corpus/olc/1425', '')).toBe('/corpus/olc/1425')
    expect(inAppHref('/', '')).toBe('/')
  })

  it('carries the query and hash, because a handoff is its filter', () => {
    expect(inAppHref('/corpus/olc?q=removal&ids=1,2', '')).toBe('/corpus/olc?q=removal&ids=1,2')
    expect(inAppHref('/corpus/olc#note', '')).toBe('/corpus/olc#note')
  })

  it('leaves anything with a scheme to the browser', () => {
    expect(inAppHref('https://www.lawfaremedia.org/article', '')).toBeNull()
    expect(inAppHref('mailto:ben@example.org', '')).toBeNull()
    expect(inAppHref('rt://olc/1425', '')).toBeNull()
  })

  it('refuses a protocol-relative URL, which is a path only in appearance', () => {
    expect(inAppHref('//evil.example/corpus/olc', '')).toBeNull()
    expect(inAppHref('/\\evil.example/corpus/olc', '')).toBeNull()
  })

  it('refuses the empty href a failed citation transform leaves behind', () => {
    expect(inAppHref('', '')).toBeNull()
  })
})

describe('inAppHref, mounted under a subpath', () => {
  it('strips the mount prefix', () => {
    expect(inAppHref('/ragtime/corpus/olc/1425', '/ragtime')).toBe('/corpus/olc/1425')
    expect(inAppHref('/ragtime', '/ragtime')).toBe('/')
    expect(inAppHref('/ragtime?q=x', '/ragtime')).toBe('/?q=x')
  })

  it('requires the prefix to be a whole segment', () => {
    expect(inAppHref('/ragtimeish/corpus/olc', '/ragtime')).toBeNull()
  })

  it('leaves a path outside the mount point alone', () => {
    expect(inAppHref('/corpus/olc/1425', '/ragtime')).toBeNull()
  })
})
