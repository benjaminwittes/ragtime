import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  type LawfareAmaPlan,
  type LawfareAmaSynthesis,
  type LawfareArticleDisplayRow,
  fetchLawfareItemsByIds,
} from '@lawfare/ragtime-client'
import { TruncationBanner } from '../components/TruncationBanner'
import { filterTruncationMarker } from '../components/truncation-marker'
import { LawfareArticleRowsList } from './LawfareResultsList'
import { MARKDOWN_COMPONENTS } from '../components/markdown-components'

/**
 * AMA result panel for the Lawfare spoke. Renders the narrative + plan
 * disclosure + candor notes + cited pieces.
 *
 * Layout (top to bottom):
 *   - Plan (collapsible) — what the agent decided to do
 *   - Candor notes
 *   - Narrative markdown — the actual answer
 *   - Cited pieces — the article_ids the agent returned (list/hybrid only);
 *     each links to its canonical lawfaremedia.org URL and opens the reader.
 *
 * Editorial register: attribution-forward. The synthesis reports what Lawfare
 * authors have argued, with per-author and per-piece attribution; it never
 * adjudicates which view is right. The plan + candor notes sit above the
 * answer so the user sees the methodology before the prose.
 */
export function LawfareAmaResult({
  synthesis,
  plan,
  loading,
  error,
  onOpenArticle,
}: {
  synthesis: LawfareAmaSynthesis | null
  plan: LawfareAmaPlan | null
  loading: boolean
  error: string | undefined
  onOpenArticle: (row: LawfareArticleDisplayRow) => void
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
        Ask what Lawfare has written or argued about a topic to see a
        synthesis here.
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
      {synthesis.article_ids && synthesis.article_ids.length > 0 && (
        <CitedArticles
          // Remount on ids change so state initializes to defaults rather than
          // reset-in-effect.
          key={synthesis.article_ids.join(',')}
          ids={synthesis.article_ids}
          onOpenArticle={onOpenArticle}
        />
      )}
    </section>
  )
}

/**
 * Cited-pieces panel. Fetches metadata for the synthesis-returned article ids
 * and renders them with the same `LawfareArticleRowsList` the manual filter
 * uses, so cited rows match filter rows exactly.
 */
function CitedArticles({
  ids,
  onOpenArticle,
}: {
  ids: readonly string[]
  onOpenArticle: (row: LawfareArticleDisplayRow) => void
}) {
  const [rows, setRows] = useState<LawfareArticleDisplayRow[] | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const rowsLoading = rows === null && rowsError === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchLawfareItemsByIds(ids as string[])
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
        Cited pieces ({ids.length.toLocaleString()})
      </h3>
      {rowsLoading && (
        <p className="text-xs text-muted-foreground">Loading cited pieces…</p>
      )}
      {rowsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t load cited pieces: {rowsError}
        </p>
      )}
      {rows && rows.length > 0 && (
        <LawfareArticleRowsList rows={rows} onOpenArticle={onOpenArticle} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          (No matching pieces found for the cited ids.)
        </p>
      )}
    </section>
  )
}

function PlanDisclosure({ plan }: { plan: LawfareAmaPlan }) {
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
