import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import type { StageDoc } from '@/stage/record'
import { ON_STAGE } from '@/stage/record'
import { recordOf } from '@/stage/recordGather'
import { RecordStage } from '@/stage/RecordStage'

/** How a collection page shows the results it has: as the table, or as ground. */
export type ResultsView = 'table' | 'terrain'

const VIEWS: { view: ResultsView; said: string }[] = [
  { view: 'table', said: 'Table' },
  { view: 'terrain', said: 'Terrain' },
]

/**
 * The switch between the two. The table is what a collection page opens on and what holds
 * every row; the terrain is another way of looking at the first of the same rows.
 */
export function ResultsViewSwitch({ view, onChange, className }: { view: ResultsView; onChange: (view: ResultsView) => void; className?: string }) {
  return (
    <div role="group" aria-label="Show results as" className={cn('inline-flex overflow-hidden rounded-md border border-border text-sm', className)} data-results-view={view}>
      {VIEWS.map((each) => (
        <button
          key={each.view}
          type="button"
          aria-pressed={view === each.view}
          onClick={() => onChange(each.view)}
          className="px-3 py-1 text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-lawfare-teal-bg aria-pressed:text-foreground"
        >
          {each.said}
        </button>
      ))}
    </div>
  )
}

/**
 * A collection page's results, as ground: the drawing the stage shows for a search brought
 * on (`stage/RecordStage`), made from the rows the page already holds, so nothing more is
 * asked of the service. Each row is mapped by the collection's own mapper (`stage/record`),
 * which is what keeps the two drawings of one document the same drawing.
 *
 * It shows the first of the rows — as many as a stage holds — and says how many there are
 * in all; the table has the rest. Clicking a column opens the document the way the page's
 * table does.
 */
export function ResultsTerrain<Row>({
  corpus,
  rows,
  total,
  toDoc,
  onOpen,
}: {
  corpus: string
  rows: readonly Row[]
  total: number
  toDoc: (row: Row) => StageDoc
  onOpen: (row: Row) => void
}) {
  const shown = useMemo(() => rows.slice(0, ON_STAGE), [rows])
  const scene = useMemo(() => recordOf(corpus, '', shown.map(toDoc), total), [corpus, shown, toDoc, total])
  if (!scene) return null
  return (
    <div className="stage-house flex h-[clamp(26rem,72vh,46rem)] flex-col [container-type:inline-size]" data-results-terrain="">
      <RecordStage
        scene={scene}
        focus={null}
        plain
        onOpen={(id) => {
          const at = scene.docs.findIndex((doc) => doc.id === id)
          if (at >= 0) onOpen(shown[at])
        }}
      />
    </div>
  )
}
