import type { ReactNode } from 'react'

/**
 * The speech slot: where a later builder attaches what the owl says.
 *
 * Nothing here speaks yet. What exists is the place for it, so that speech does not have
 * to change the owl, its renderers, or the six pages that mount it:
 *
 *   - `OwlSpot` (`OwlSpot.tsx`) takes an optional `speech` node and, when it is given,
 *     renders it inside `OwlSpeech` below, anchored to the owl's box. Without one the
 *     placement is exactly what it was — no wrapper, no extra node.
 *   - The design carries `voice` (`types.ts`), the id of a voice. A variant can set it,
 *     and a knob group can expose it, the way every other design value is exposed.
 *
 * What the builder decides: what a `speech` node is (captions, a bubble, a live region),
 * where voices come from, and the anchoring in `owl.css` (`.owl-speech`, which today only
 * positions the slot beside the figure). The slot is a polite live region, so what is
 * put in it is announced; keep it to what the owl says and not to decoration.
 */
export function OwlSpeech({ children }: { children: ReactNode }) {
  return (
    <div className="owl-speech" role="status">
      {children}
    </div>
  )
}
