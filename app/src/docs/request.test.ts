import { describe, it, expect } from 'vitest'

import { docsEntries } from './registry'
import { docsLink, docsRequested } from './request'

describe('docsRequested', () => {
  it('reads the slug a link asked for, and nothing from a link that did not ask', () => {
    expect(docsRequested('?docs=connecting-claude')).toBe('connecting-claude')
    expect(docsRequested('?q=habeas&docs=giving-feedback')).toBe('giving-feedback')
    expect(docsRequested('?docs=')).toBeNull()
    expect(docsRequested('?q=docs')).toBeNull()
    expect(docsRequested('')).toBeNull()
  })
})

describe('docsLink', () => {
  it('turns to another docs page without leaving the overlay', () => {
    expect(docsLink('/?docs=giving-feedback')).toEqual({ kind: 'entry', slug: 'giving-feedback' })
  })

  it('navigates in the app for a route, query and all', () => {
    expect(docsLink('/explorer')).toEqual({ kind: 'route', to: '/explorer' })
    expect(docsLink('/?tour=1')).toEqual({ kind: 'route', to: '/?tour=1' })
    expect(docsLink('/corpus/olc?q=emergency')).toEqual({ kind: 'route', to: '/corpus/olc?q=emergency' })
  })

  it('hands a served file to the browser instead of the router', () => {
    expect(docsLink('/guides/connect-claude.pdf')).toEqual({ kind: 'file', to: '/guides/connect-claude.pdf' })
  })

  it('leaves everything else to the browser, including a path that is not one', () => {
    expect(docsLink('https://claude.ai')).toEqual({ kind: 'outside', href: 'https://claude.ai' })
    expect(docsLink('//evil.example/x')).toEqual({ kind: 'outside', href: '//evil.example/x' })
    expect(docsLink('mailto:someone@example.org')).toEqual({ kind: 'outside', href: 'mailto:someone@example.org' })
  })
})

describe('the links the docs pages actually carry', () => {
  // A docs page that links to an entry nobody registered opens the overlay on
  // nothing. Checked here because the registry is the only place that knows.
  it('every ?docs= link names a registered entry', () => {
    const slugs = new Set(docsEntries.map((e) => e.slug))
    const dangling: string[] = []
    for (const e of docsEntries) {
      for (const m of e.content.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const link = docsLink(m[1])
        if (link.kind === 'entry' && !slugs.has(link.slug)) dangling.push(`${e.slug}: ${m[1]}`)
      }
    }
    expect(dangling).toEqual([])
  })
})
