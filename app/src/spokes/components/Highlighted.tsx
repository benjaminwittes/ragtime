import type { ReactNode } from 'react'

import type { Segment } from './highlight'

/**
 * Segments as React children, matches in `<mark>`. The text is external and
 * untrusted (docket entries, CourtListener snippets), so it is only ever a
 * string child, which React escapes: no `dangerouslySetInnerHTML`.
 */
export function Highlighted({ segments }: { segments: readonly Segment[] }): ReactNode {
  return segments.map((s, i) =>
    s.hit ? (
      // `--color-lawfare-mark` has one job on this surface and this is it: the wash under
      // a term the reader searched for. Not a surface, not a state, not a chip — and no
      // corner, because a highlighted run of words is not an object.
      <mark key={i} className="bg-lawfare-mark px-0.5 font-medium text-foreground">
        {s.text}
      </mark>
    ) : (
      s.text
    ),
  )
}
