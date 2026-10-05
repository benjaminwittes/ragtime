import type { Tunable, TuneValue } from './types'

/**
 * Settings that belong under another one, as a plain function of the knobs, so it is tested in
 * node (`tree.test.ts`). A knob names its parent (`Tunable.parent`); it is nested under that
 * parent when the parent is in the list, and is an ordinary row when it is not (a search that
 * found the child and not the parent still shows it).
 */

export type Node = { knob: Tunable; kids: Node[] }

export function nest(list: readonly Tunable[]): Node[] {
  const ids = new Set(list.map((k) => k.id))
  const nodes = new Map(list.map((knob) => [knob.id, { knob, kids: [] as Node[] }]))
  const roots: Node[] = []
  for (const knob of list) {
    const node = nodes.get(knob.id)!
    const parent = knob.parent && knob.parent !== knob.id && ids.has(knob.parent) ? nodes.get(knob.parent) : undefined
    if (parent) parent.kids.push(node)
    else roots.push(node)
  }
  return roots
}

/** Is a parent's value "on", so that what is under it is worth showing? Off, none and still are not. */
export function isOn(value: TuneValue | undefined): boolean {
  if (value === undefined || value === false || value === '' || value === 0) return false
  if (typeof value === 'string') return !['off', 'none', 'still'].includes(value.toLowerCase())
  return true
}
