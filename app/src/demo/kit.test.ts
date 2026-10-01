import { describe, it, expect } from 'vitest'

// The script that writes the file this module reads. Imported rather than
// re-implemented, so the two halves of the format are tested against each other.
import { newPassphrase, parseDeck, seal } from '../../scripts/seal-kit.mjs'
import { demoView, openKit, passphraseIn, slideAfter, type Kit, type SealedKit } from './kit'

const KIT: Kit = {
  title: 'A demo',
  when: 'Thursday',
  guide: '# Guide\n\nSay hello — and mean it.',
  slides: [{ part: 'Part I', title: 'Hello', body: 'One line.', notes: 'Breathe.' }],
}

describe('a sealed kit', () => {
  it('opens with the passphrase it was sealed with, and only that one', async () => {
    const sealed = (await seal(JSON.stringify(KIT), 'correct horse battery staple')) as SealedKit
    expect(await openKit(sealed, 'correct horse battery staple')).toEqual({ ok: true, kit: KIT })
    expect(await openKit(sealed, 'correct horse battery stapler')).toEqual({ ok: false, why: 'wrong' })
  })

  it('carries none of its words in the clear', async () => {
    const sealed = await seal(JSON.stringify(KIT), 'correct horse battery staple')
    const served = JSON.stringify(sealed)
    for (const word of ['Guide', 'hello', 'Breathe', 'Thursday']) expect(served).not.toContain(word)
  })

  it('is sealed differently every time, so two builds do not show what did not change', async () => {
    const a = (await seal('same', 'pass-pass-pass-pass')) as SealedKit
    const b = (await seal('same', 'pass-pass-pass-pass')) as SealedKit
    expect(a.data).not.toBe(b.data)
    expect(a.salt).not.toBe(b.salt)
  })

  it('says unreadable, not wrong, for a format this build does not know', async () => {
    const sealed = (await seal(JSON.stringify(KIT), 'pass-pass-pass-pass')) as SealedKit
    expect(await openKit({ ...sealed, v: 2 }, 'pass-pass-pass-pass')).toEqual({ ok: false, why: 'unreadable' })
  })

  it('says wrong for a file that was altered after sealing', async () => {
    const sealed = (await seal(JSON.stringify(KIT), 'pass-pass-pass-pass')) as SealedKit
    const flipped = sealed.data.startsWith('A') ? 'B' + sealed.data.slice(1) : 'A' + sealed.data.slice(1)
    expect(await openKit({ ...sealed, data: flipped }, 'pass-pass-pass-pass')).toEqual({ ok: false, why: 'wrong' })
  })
})

describe('a generated passphrase', () => {
  it('is long, and survives a URL fragment untouched', () => {
    const made = newPassphrase()
    expect(made).toMatch(/^[A-Za-z0-9]{24}$/)
    expect(passphraseIn(`#k=${made}`)).toBe(made)
    expect(newPassphrase()).not.toBe(made)
  })
})

describe('passphraseIn', () => {
  it('reads the fragment, and nothing from a link that carries none', () => {
    expect(passphraseIn('#k=abc')).toBe('abc')
    expect(passphraseIn('#k=')).toBeNull()
    expect(passphraseIn('')).toBeNull()
    expect(passphraseIn('#slide-3')).toBeNull()
  })
})

describe('parseDeck', () => {
  it('reads a part, a title, a body and notes from each slide', () => {
    const slides = parseDeck(
      ['part: Part I', '# Hello', '', '- one', '- two', '', '???', 'Say it slowly.', '---', '# Second', 'Body only.'].join('\n'),
    )
    expect(slides).toEqual([
      { part: 'Part I', title: 'Hello', body: '- one\n- two', notes: 'Say it slowly.' },
      { part: '', title: 'Second', body: 'Body only.', notes: '' },
    ])
  })

  it('skips an empty chunk, so a trailing rule is not a blank last slide', () => {
    expect(parseDeck('# Only\n\n---\n')).toHaveLength(1)
  })
})

describe('demoView', () => {
  it('names the two faces and nothing else', () => {
    expect(demoView('/demo')).toBe('guide')
    expect(demoView('/demo/')).toBe('guide')
    expect(demoView('/demo/deck')).toBe('deck')
    expect(demoView('/demo/other')).toBeNull()
    expect(demoView('/demonstration')).toBeNull()
  })
})

describe('slideAfter', () => {
  it('moves one slide and stops at both ends', () => {
    expect(slideAfter('ArrowRight', 0, 3)).toBe(1)
    expect(slideAfter(' ', 1, 3)).toBe(2)
    expect(slideAfter('ArrowRight', 2, 3)).toBe(2)
    expect(slideAfter('ArrowLeft', 0, 3)).toBe(0)
    expect(slideAfter('End', 0, 3)).toBe(2)
    expect(slideAfter('Home', 2, 3)).toBe(0)
    expect(slideAfter('x', 1, 3)).toBe(1)
  })
})
