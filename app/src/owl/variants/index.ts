import type { OwlVariant } from '../types'

/**
 * The variants, by id.
 *
 * A variant is a file here — `variants/<name>.ts` — whose default export is an
 * `OwlVariant`: an id, a label, and a patch over the base design that may change look
 * and behaviour together (the render style, the ink, the voice). The glob finds it; nothing else needs editing, and the
 * "Active variant" knob lists it by itself.
 *
 * `base` is the empty patch — the drawing as sent — and comes first; the rest follow in
 * file-name order.
 */

const modules = import.meta.glob<OwlVariant>(['./*.ts', '!./index.ts', '!./*.test.ts'], {
  eager: true,
  import: 'default',
})

const ALL = Object.values(modules).sort((a, b) =>
  a.id === 'base' ? -1 : b.id === 'base' ? 1 : a.id.localeCompare(b.id),
)
const BY_ID = new Map(ALL.map((variant) => [variant.id, variant]))

export function variantList(): readonly OwlVariant[] {
  return ALL
}

/** `undefined` for an id that is not registered — a stale preset can name one that went. */
export function getVariant(id: string): OwlVariant | undefined {
  return BY_ID.get(id)
}

/** For the knobs that pick one. */
export function variantOptions(): { label: string; value: string }[] {
  return ALL.map((variant) => ({ label: variant.label, value: variant.id }))
}
