import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  type FrusAmaPlan,
  type FrusAmaSynthesis,
  type FrusDocumentDisplayRow,
  fetchFrusItemsByIds,
} from '@lawfare/ragtime-client'
import { TruncationBanner } from '../components/TruncationBanner'
import { filterTruncationMarker } from '../components/truncation-marker'
import { FrusDocumentRowsTable } from './FrusResultsList'
import { MARKDOWN_COMPONENTS } from '../components/markdown-components'

/**
 * AMA result panel for the FRUS spoke. Brief #5 §5: chronological by
 * default, attribution-forward, classification surfaced, never editorialize
 * on contested interpretations.
 *
 * Layout (top to bottom):
 *   - Plan (collapsible details) — what the agent decided to do; output
 *     mode tells you which flagship the planner picked (narrative /
 *     hybrid coverage / list retrieval)
 *   - Candor notes — search dataset for "no" coverage answers,
 *     denominator for analytical counts
 *   - Narrative markdown — chronological prose with [frus-ref:DOC_ID]
 *     citations (rendered as plain text v1; click-through is via the
 *     cited documents block below)
 *   - Cited documents — document_ids the agent returned (list / hybrid
 *     modes only); each button opens the detail sheet
 */
export function FrusAmaResult({
  synthesis,
  plan,
  loading,
  error,
  onOpenDocument,
}: {
  synthesis: FrusAmaSynthesis | null
  plan: FrusAmaPlan | null
  loading: boolean
  error: string | undefined
  /** Open a document in the detail panel. PR 4v: contract changed from
   *  id-only to full row so the cited list renders with the same
   *  metadata-rich table the manual filter uses. */
  onOpenDocument: (row: FrusDocumentDisplayRow) => void
}) {
  if (loading && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Working — see the session log above for progress.
      </section>
    )
  }
  if (error && !synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8">
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      </section>
    )
  }
  if (!synthesis) {
    return (
      <section className="border-b border-border bg-background px-6 py-8 text-sm text-muted-foreground">
        Ask a question to see a narrative synthesis here.
      </section>
    )
  }

  const normalCandor = filterTruncationMarker(synthesis.candor_notes)
  return (
    <section className="border-b border-border bg-background px-6 py-6">
      {plan && <PlanDisclosure plan={plan} />}
      <TruncationBanner notes={synthesis.candor_notes} />
      {normalCandor.length > 0 && <CandorNotes notes={normalCandor} />}
      <article className="mt-4 space-y-3 text-sm text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {synthesis.answer_markdown}
        </ReactMarkdown>
      </article>
      {synthesis.document_ids && synthesis.document_ids.length > 0 && (
        <CitedDocuments
          // Remount on ids change so state initializes to defaults rather
          // than reset-in-effect (react-hooks/set-state-in-effect lint rule).
          key={synthesis.document_ids.join(',')}
          ids={synthesis.document_ids}
          onOpenDocument={onOpenDocument}
        />
      )}
    </section>
  )
}

/**
 * Cited-documents panel. PR 4v: fetches metadata for the synthesis-returned
 * document ids and renders them with the same `FrusDocumentRowsTable` the
 * manual filter uses (Title · Date · Volume · Place · Classification · ↗).
 */
function CitedDocuments({
  ids,
  onOpenDocument,
}: {
  ids: readonly number[]
  onOpenDocument: (row: FrusDocumentDisplayRow) => void
}) {
  const [rows, setRows] = useState<FrusDocumentDisplayRow[] | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)
  // Loading derived; parent remounts via `key` when ids change.
  const rowsLoading = rows === null && rowsError === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchFrusItemsByIds(ids as number[])
        if (cancelled) return
        setRows(fetched)
      } catch (e) {
        if (cancelled) return
        setRowsError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ids])

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cited documents ({ids.length.toLocaleString()})
      </h3>
      {rowsLoading && (
        <p className="text-xs text-muted-foreground">Loading cited documents…</p>
      )}
      {rowsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t load cited documents: {rowsError}
        </p>
      )}
      {rows && rows.length > 0 && (
        <FrusDocumentRowsTable rows={rows} onOpenDocument={onOpenDocument} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          (No matching documents found for the cited ids.)
        </p>
      )}
    </section>
  )
}

function PlanDisclosure({ plan }: { plan: FrusAmaPlan }) {
  const [open, setOpen] = useState(false)
  const queryCount = plan.queries.length
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-card"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        Plan ({plan.output_mode} · {queryCount} quer{queryCount === 1 ? 'y' : 'ies'})
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-xs text-foreground/90">
        <p className="leading-relaxed">{plan.approach_summary || '(no plan summary)'}</p>
        {plan.queries.length > 0 && (
          <ol className="space-y-2 list-decimal pl-5">
            {plan.queries.map((q, i) => (
              <li key={i} className="leading-snug">
                <span className="font-medium">{q.label}</span>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-border bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                  {q.sql}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}

function CandorNotes({ notes }: { notes: readonly string[] }) {
  return (
    <aside
      className={cn(
        'mb-3 rounded-md border px-3 py-2 text-xs',
        'border-amber-400/50 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider opacity-80">
        Candor notes
      </h3>
      <ul className="mt-1 list-disc pl-5">
        {notes.map((n, i) => (
          <li key={i} className="leading-relaxed">
            {n}
          </li>
        ))}
      </ul>
    </aside>
  )
}
