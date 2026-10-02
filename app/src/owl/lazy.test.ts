import { describe, expect, it } from 'vitest'
import { lazy } from './lazy'

describe('lazy', () => {
  it('has nothing until it is asked, and fetches once however often it is asked', async () => {
    let fetches = 0
    const slot = lazy(async () => {
      fetches++
      return { id: 'a' }
    })
    expect(slot.get()).toBeUndefined()
    expect(fetches).toBe(0)
    const [first, second] = await Promise.all([slot.load(), slot.load()])
    expect(first).toBe(second)
    expect(slot.get()).toBe(first)
    await slot.load()
    expect(fetches).toBe(1)
  })

  it('forgets a failed fetch, so the next ask tries again', async () => {
    let fetches = 0
    const slot = lazy(async () => {
      fetches++
      if (fetches === 1) throw new Error('offline')
      return 'here'
    })
    await expect(slot.load()).rejects.toThrow('offline')
    expect(slot.get()).toBeUndefined()
    expect(await slot.load()).toBe('here')
  })

  it('takes a module handed to it, and then fetches nothing', async () => {
    let fetches = 0
    const slot = lazy(async () => {
      fetches++
      return 1
    })
    slot.provide(2)
    expect(slot.get()).toBe(2)
    expect(await slot.load()).toBe(2)
    expect(fetches).toBe(0)
  })
})
