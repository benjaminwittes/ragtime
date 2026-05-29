import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  type UscAmaPlan,
  type UscAmaSynthesis,
  type UscSectionDisplayRow,
  fetchUscItemsByIds,
} from '@/lib/worker-client'
import { UscSectionRowsTable } from './UscResultsList'

/**
 * AMA result panel for the USC spoke. Brief #3 §5 — neutral, attribution-
 * forward, release-point currency surfaced, non-positive-law restatement
 * surfaced, constitution gap flagged when relevant.
 *
 * Layout:
 *   - Plan disclosure (collapsible) — what the agent decided to do
 *   - Candor notes — currency, non-positive-law, constitution gap,
 *     cross-corpus deferral on Authority-synthesis questions
 *   - Narrative markdown — the legal analysis
 *   - Cited sections — section_ids returned by synthesis (list/hybrid
 *     output modes); each opens the section detail
 */
export function UscAmaResult({
  synthesis,
  plan,
  loading,
  error,
  onOpenSection,
}: {
  synthesis: UscAmaSynthesis | null
  plan: UscAmaPlan | null
  loading: boolean
  error: string | undefined
  /** Open a section in the detail panel. PR 4v: contract changed from
   *  id-only to full row so the cited list renders with the same
   *  metadata-rich table the manual filter uses. */
  onOpenSection: (row: UscSectionDisplayRow) => void
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
        Ask a question to see a legal-analysis answer here.
      </section>
    )
  }

  return (
    <section className="border-b border-border bg-background px-6 py-6">
      {plan && <PlanDisclosure plan={plan} />}
      {synthesis.candor_notes.length > 0 && (
        <CandorNotes notes={synthesis.candor_notes} />
      )}
      <article className="mt-4 space-y-3 text-sm text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={MARKDOWN_COMPONENTS}
        >
          {synthesis.answer_markdown}
        </ReactMarkdown>
      </article>
      {synthesis.section_ids && synthesis.section_ids.length > 0 && (
        <CitedSections
          // Remount on ids change so state initializes to defaults rather
          // than reset-in-effect (react-hooks/set-state-in-effect lint rule).
          key={synthesis.section_ids.join(',')}
          ids={synthesis.section_ids}
          onOpenSection={onOpenSection}
        />
      )}
    </section>
  )
}

/**
 * Cited-sections panel. PR 4v: fetches metadata for the synthesis-returned
 * section ids and renders them with the same `UscSectionRowsTable` the
 * manual filter uses (Citation · Heading · Title · Status, with
 * positive-law badge inline on the citation).
 */
function CitedSections({
  ids,
  onOpenSection,
}: {
  ids: readonly number[]
  onOpenSection: (row: UscSectionDisplayRow) => void
}) {
  const [rows, setRows] = useState<UscSectionDisplayRow[] | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)
  // Loading derived; parent remounts via `key` when ids change.
  const rowsLoading = rows === null && rowsError === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchUscItemsByIds(ids as number[])
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
        Cited sections ({ids.length.toLocaleString()})
      </h3>
      {rowsLoading && (
        <p className="text-xs text-muted-foreground">Loading cited sections…</p>
      )}
      {rowsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t load cited sections: {rowsError}
        </p>
      )}
      {rows && rows.length > 0 && (
        <UscSectionRowsTable rows={rows} onOpenSection={onOpenSection} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          (No matching sections found for the cited ids.)
        </p>
      )}
    </section>
  )
}

function PlanDisclosure({ plan }: { plan: UscAmaPlan }) {
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

const MARKDOWN_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="font-serif text-2xl font-semibold mt-2 mb-3" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2
      className="font-serif text-xl font-semibold mt-5 mb-2 border-b border-border pb-1"
      {...props}
    />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="font-serif text-base font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="leading-relaxed text-foreground" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-primary hover:underline" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc pl-6 space-y-1" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal pl-6 space-y-1" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <table className="my-3 w-full border-collapse text-xs" {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-border bg-muted/40 px-2 py-1 text-left font-medium"
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-border px-2 py-1 align-top" {...props} />
  ),
}
