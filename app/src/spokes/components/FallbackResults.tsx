import { useState } from 'react'
import type { SemanticSearchRow } from '@lawfare/ragtime-client'

import { FALLBACK_NOTICE, showsFallback, type BoxFallbackView } from '@/lib/box-fallback'
import { SearchedAs } from './SearchedAs'
import { SemanticResultsList } from './SemanticResultsList'

/**
 * What a corpus page's keyword pane shows when no document holds every word
 * of the search but hybrid search found something (lib/box-fallback.ts): the
 * "Searched as" line, a notice saying these are not keyword matches, and
 * hybrid search's results in the meaning pane's list. Renders nothing when
 * there is nothing to show, so a list keeps its own empty state then.
 */
export function FallbackResults({
  fallback,
  searchedAs,
}: {
  fallback: BoxFallbackView
  /** The "Searched as" line, kept above the notice. */
  searchedAs?: string | null
}) {
  const [openingId, setOpeningId] = useState<string | null>(null)
  if (!showsFallback(fallback)) return null
  const { reply, onOpen } = fallback

  async function open(row: SemanticSearchRow) {
    setOpeningId(row.id)
    try {
      await onOpen(row)
    } catch {
      // Opening is best-effort, as in the meaning pane.
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div data-testid="box-fallback" className="pt-4">
      <div className="px-6">
        <SearchedAs line={searchedAs} />
        <p className="mt-1 text-sm text-muted-foreground">{FALLBACK_NOTICE}</p>
      </div>
      <SemanticResultsList
        rows={reply.results}
        loading={false}
        error={undefined}
        hasRun
        onOpen={(row) => void open(row)}
        openingId={openingId}
      />
    </div>
  )
}
