import { describe, it, expect } from 'vitest'

// The script that makes the key a presenter signs with. Imported, not re-implemented, so
// the key the kit ships and the code that checks against it are tested against each other.
import { newStageKeys as scriptKeys, seal, stageKeysIn, unseal } from '../../scripts/seal-kit.mjs'
import {
  MAX_SKEW_MS,
  NOBODY,
  QUIET_AFTER_MS,
  accept,
  isLive,
  joiner,
  newStageKeys,
  pack,
  sign,
  signingKey,
  stageName,
  toWire,
  unpack,
  verify,
  verifyingKey,
  type BeatMsg,
  type FrameMsg,
  type Msg,
  type Scene,
  type StateMsg,
} from './protocol'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SLIDE: Scene = { kind: 'slide', at: 0, of: 3, part: '', title: 'Hello', body: 'One line.' }
const T = 1_800_000_000_000

function state(over: Partial<StateMsg> = {}): StateMsg {
  return { v: 1, sid: 'a', n: 0, t: T, kind: 'state', who: 'Mary', since: T, scene: SLIDE, ...over }
}
function beat(over: Partial<BeatMsg> = {}): BeatMsg {
  return { v: 1, sid: 'a', n: 1, t: T, kind: 'beat', on: 0, frame: null, ...over }
}

describe('a signed message', () => {
  it('verifies against the kit’s public key, and is the message that was signed', async () => {
    const keys = await newStageKeys()
    const signed = await sign(state(), await signingKey(keys.key))
    expect(await verify(signed, await verifyingKey(keys.pub))).toEqual(state())
  })

  it('is refused when one character of it changes', async () => {
    const keys = await newStageKeys()
    const signed = await sign(state(), await signingKey(keys.key))
    const forged = { ...signed, p: signed.p.replace('Hello', 'Hullo') }
    expect(await verify(forged, await verifyingKey(keys.pub))).toBeNull()
  })

  it('is refused when it was signed with some other key', async () => {
    const mine = await newStageKeys()
    const theirs = await newStageKeys()
    const signed = await sign(state(), await signingKey(theirs.key))
    expect(await verify(signed, await verifyingKey(mine.pub))).toBeNull()
  })

  it('is refused, not thrown on, when it is not a message at all', async () => {
    const keys = await newStageKeys()
    const pub = await verifyingKey(keys.pub)
    expect(await verify({ p: 'x', s: 'not base64 !!' }, pub)).toBeNull()
    expect(await verify({ p: 1, s: 2 } as never, pub)).toBeNull()
  })

  it('verifies with the key the seal script makes', async () => {
    const keys = await scriptKeys()
    const signed = await sign(state(), await signingKey(keys.key))
    expect(await verify(signed, await verifyingKey(keys.pub))).toEqual(state())
  })

  it('can be checked with a public key that arrived carrying more than it should', async () => {
    // A private JWK is a public one with a `d`. Read as a verifying key, only x and y count.
    const keys = await newStageKeys()
    const signed = await sign(state(), await signingKey(keys.key))
    expect(await verify(signed, await verifyingKey(keys.key))).toEqual(state())
  })
})

describe('the seal script’s signing key', () => {
  it('is kept across a re-seal with the same passphrase, and replaced with a new one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-keys-'))
    const file = path.join(dir, 'kit.sealed.json')
    const keys = await scriptKeys()
    const sealed = await seal(JSON.stringify({ title: 't', guide: '', slides: [], stage: { key: keys.key } }), 'pass-pass-pass-pass')
    fs.writeFileSync(file, JSON.stringify({ ...sealed, stage: { pub: keys.pub } }))

    expect(await stageKeysIn(file, 'pass-pass-pass-pass')).toEqual(keys)
    expect(await stageKeysIn(file, 'some-other-passphrase')).toBeNull()
    expect(await stageKeysIn(path.join(dir, 'absent.json'), 'pass-pass-pass-pass')).toBeNull()
    fs.rmSync(dir, { recursive: true })
  })

  it('is inside the seal, and its public half is not', async () => {
    const keys = await scriptKeys()
    const sealed = await seal(JSON.stringify({ stage: { key: keys.key } }), 'pass-pass-pass-pass')
    expect(JSON.stringify(sealed)).not.toContain(keys.key.d)
    expect(JSON.parse((await unseal(sealed, 'pass-pass-pass-pass')) as string).stage.key.d).toBe(keys.key.d)
  })
})

describe('a stage’s name', () => {
  it('is the same for the same key and different for another', async () => {
    const a = await newStageKeys()
    const b = await newStageKeys()
    expect(await stageName(a.pub)).toBe(await stageName(a.pub))
    expect(await stageName(a.pub)).not.toBe(await stageName(b.pub))
    expect(await stageName(a.pub)).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('a message too large to send whole', () => {
  it('goes in pieces and comes back as itself', () => {
    const signed = { p: 'x'.repeat(1000), s: 'sig' }
    const wires = toWire(signed, 'id1', 300)
    expect(wires.length).toBeGreaterThan(3)
    const join = joiner()
    const out = wires.map((wire) => join(wire))
    expect(out.slice(0, -1).every((each) => each === null)).toBe(true)
    expect(out.at(-1)).toEqual(signed)
  })

  it('is sent whole when it fits', () => {
    const signed = { p: 'small', s: 'sig' }
    expect(toWire(signed, 'id')).toEqual([{ m: signed }])
    expect(joiner()({ m: signed })).toEqual(signed)
  })

  it('arriving twice, on two legs, is completed once', () => {
    const signed = { p: 'y'.repeat(500), s: 'sig' }
    const wires = toWire(signed, 'id2', 200)
    const join = joiner()
    const first = wires.map((wire) => join(wire)).filter(Boolean)
    const second = wires.map((wire) => join(wire)).filter(Boolean)
    expect(first).toEqual([signed])
    expect(second).toEqual([])
  })

  it('interleaved with another, both come back', () => {
    const one = { p: '1'.repeat(500), s: 'a' }
    const two = { p: '2'.repeat(500), s: 'b' }
    const a = toWire(one, 'one', 200)
    const b = toWire(two, 'two', 200)
    const join = joiner()
    const got = [a[0], b[0], a[1], b[1], a[2], b[2], ...a.slice(3), ...b.slice(3)].map((wire) => join(wire)).filter(Boolean)
    expect(got).toEqual([one, two])
  })

  it('ignores pieces that could not be pieces', () => {
    const join = joiner()
    expect(join({ c: 'x', i: 5, of: 2, d: '' })).toBeNull()
    expect(join({ c: 'x', i: 0, of: 100000, d: '' })).toBeNull()
    expect(join({ hello: 'n' })).toBeNull()
    // The channel is open: what arrives need not even be an object.
    for (const junk of ['nonsense', null, 7, undefined, { m: 'text' }, { c: 1, i: 0, of: 1, d: {} }]) {
      expect(join(junk as never)).toBeNull()
    }
    expect(join({ c: 'j', i: 0, of: 1, d: '"a string, which is valid JSON"' })).toBeNull()
  })
})

describe('packing a frame', () => {
  it('round-trips, and is smaller than markup', async () => {
    const html = '<div class="row">A result, with text in it.</div>'.repeat(400)
    const packed = await pack(html)
    expect(packed.length).toBeLessThan(html.length / 5)
    expect(await unpack(packed)).toBe(html)
  })

  it('reads what a browser without compression sent', async () => {
    expect(await unpack('r:<p>plain</p>')).toBe('<p>plain</p>')
  })
})

describe('what a stage believes', () => {
  it('goes live on a fresh state, and quiet when the beats stop', () => {
    const following = accept(NOBODY, state(), T + 50, null)
    expect(following.holder).toEqual({ sid: 'a', who: 'Mary', since: T })
    expect(isLive(following, T + 50)).toBe(true)
    expect(isLive(following, T + QUIET_AFTER_MS + 100)).toBe(false)
    const kept = accept(following, beat({ t: T + 4000 }), T + 4000, null)
    expect(isLive(kept, T + QUIET_AFTER_MS + 100)).toBe(true)
  })

  it('goes quiet at once on a goodbye', () => {
    const following = accept(NOBODY, state(), T, null)
    const gone = accept(following, { v: 1, sid: 'a', n: 1, t: T + 1, kind: 'bye' }, T + 1, null)
    expect(gone.holder).toBeNull()
    expect(isLive(gone, T + 1)).toBe(false)
  })

  it('uses a message once: a replay changes nothing', () => {
    const following = accept(NOBODY, state({ n: 5 }), T, null)
    expect(accept(following, state({ n: 5 }), T, null)).toBe(following)
    expect(accept(following, state({ n: 4, scene: { kind: 'figure', name: 'x' } }), T, null)).toBe(following)
  })

  it('refuses a recording: a state from long ago, however well signed', () => {
    const later = T + MAX_SKEW_MS + 1
    expect(accept(NOBODY, state(), later, null)).toBe(NOBODY)
  })

  it('believes an answer to its own hello whatever the clocks say, and measures the clock', () => {
    // This reader's clock is ten minutes ahead of the presenter's.
    const now = T + 600_000
    const following = accept(NOBODY, state({ re: ['other', 'mine'] }), now, 'mine')
    expect(following.holder?.sid).toBe('a')
    expect(following.skew.a).toBe(600_000)
    // And then follows that presenter's unquoted messages by the measured clock.
    const next = accept(following, beat({ t: T + 4000 }), now + 4000, 'mine')
    expect(next.heard).toBe(now + 4000)
    // Someone else's hello being answered proves nothing to this reader.
    expect(accept(NOBODY, state({ re: ['other'] }), now, 'mine')).toBe(NOBODY)
  })

  it('ignores beats, frames and pointing from anyone who is not the presenter', () => {
    const following = accept(NOBODY, state(), T, null)
    const after = accept(following, beat({ sid: 'b', n: 0, t: T + 20_000 }), T + 20_000, null)
    expect(after.heard).toBe(T)
    expect(after.holder?.sid).toBe('a')
  })

  it('gives the stage to whoever went live most recently', () => {
    const mary = accept(NOBODY, state(), T, null)
    const thomas = accept(mary, state({ sid: 'b', who: 'Thomas', since: T + 5000, t: T + 5000 }), T + 5000, null)
    expect(thomas.holder).toEqual({ sid: 'b', who: 'Thomas', since: T + 5000 })
  })

  it('does not give it back to a superseded presenter who answers a hello late', () => {
    const mary = accept(NOBODY, state(), T, null)
    const thomas = accept(mary, state({ sid: 'b', who: 'Thomas', since: T + 5000, t: T + 5000 }), T + 5000, null)
    // Mary has not heard yet, and re-states her slide after Thomas took over.
    const late = accept(thomas, state({ n: 9, t: T + 5200 }), T + 5200, null)
    expect(late.holder?.sid).toBe('b')
    expect(late.state?.sid).toBe('b')
  })

  it('lets anyone take a stage whose presenter has gone silent', () => {
    const mary = accept(NOBODY, state(), T, null)
    const much = T + QUIET_AFTER_MS + 5000
    // Older claim, but nobody is holding the stage any more.
    const back = accept(mary, state({ sid: 'c', who: 'Katherine', since: T - 1000, t: much }), much, null)
    expect(back.holder?.sid).toBe('c')
  })

  it('drops the last presenter’s page when the presenter changes, and keeps it when they do not', () => {
    const frame: FrameMsg = { v: 1, sid: 'a', n: 1, t: T, kind: 'frame', path: '/', html: 'r:', cls: '', vars: {}, y: 0 }
    const withFrame = accept(accept(NOBODY, state({ scene: { kind: 'mirror' } }), T, null), frame, T, null)
    expect(withFrame.frame).toBe(frame)
    const same = accept(withFrame, state({ n: 2, scene: { kind: 'mirror' } }), T, null)
    expect(same.frame).toBe(frame)
    const other = accept(withFrame, state({ sid: 'b', since: T + 1, t: T + 1, scene: { kind: 'mirror' } }), T + 1, null)
    expect(other.frame).toBeNull()
  })

  it('takes a scroll and a pointer from the presenter, and a frame clears the scroll before it', () => {
    let following = accept(NOBODY, state({ scene: { kind: 'mirror' } }), T, null)
    const msgs: Msg[] = [
      { v: 1, sid: 'a', n: 1, t: T, kind: 'scroll', at: [], y: 0.5 },
      { v: 1, sid: 'a', n: 2, t: T, kind: 'point', at: [0, 1], x: 0.5, y: 0.5 },
    ]
    for (const msg of msgs) following = accept(following, msg, T, null)
    expect(following.scroll?.y).toBe(0.5)
    expect(following.point?.at).toEqual([0, 1])
    following = accept(following, { v: 1, sid: 'a', n: 3, t: T, kind: 'frame', path: '/x', html: 'r:', cls: '', vars: {}, y: 0 }, T, null)
    expect(following.scroll).toBeNull()
    expect(following.point?.at).toEqual([0, 1])
  })
})
