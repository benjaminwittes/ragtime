import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  type SanctionsAmaPlan,
  type SanctionsAmaSynthesis,
  type SanctionsCountQueryResult,
  type SanctionsEntityDisplayRow,
  type SanctionsProseItem,
  fetchSanctionsEntitiesByIds,
} from '@/lib/worker-client'
import { TruncationBanner } from '../components/TruncationBanner'
import { filterTruncationMarker } from '../components/truncation-marker'
import { SanctionsEntityRowsTable } from './SanctionsEntityResultsList'

/**
 * AMA result panel for the Sanctions spoke — BRANCH-SHAPED (brief #15
 * decision #3, the 3-branch router):
 *
 *  - entity: narrative + the cited entity list (the same table the entity
 *    pane uses) + the executed-query summary. The Worker leads the candor
 *    notes with the pinned screening note + live data-as-of.
 *  - count:  narrative + EVERY executed query with its rows (the hub
 *    count-branch dual-output invariant: the dataset is the proof).
 *  - prose:  cited narrative + the source passages it drew from (guidance +
 *    FR-slice documents, openable in their detail sheets).
 *
 * The router's classification is disclosed up front — the user sees WHICH
 * kind of answer they got and why, before reading it.
 */
export function SanctionsAmaResult({
  synthesis,
  plan,
  loading,
  error,
  onOpenEntity,
  onOpenQualifiedId,
}: {
  synthesis: SanctionsAmaSynthesis | null
  plan: SanctionsAmaPlan | null
  loading: boolean
  error: string | undefined
  onOpenEntity: (row: SanctionsEntityDisplayRow) => void
  /** Open a leg-qualified source id ('guidance:123' / 'fr:456'). */
  onOpenQualifiedId: (id: string) => void
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
        Ask a question — entity lookups, what the guidance means, program
        counts, and how designations evolved all route to the right engine.
      </section>
    )
  }

  const normalCandor = filterTruncationMarker(synthesis.candor_notes)
  return (
    <section className="border-b border-border bg-background px-6 py-6">
      <BranchBadge branch={synthesis.branch} reason={plan?.reason ?? null} />
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
      {synthesis.branch === 'entity' &&
        synthesis.entity_ids &&
        synthesis.entity_ids.length > 0 && (
          <CitedEntities
            key={synthesis.entity_ids.join(',')}
            ids={synthesis.entity_ids}
            onOpenEntity={onOpenEntity}
          />
        )}
      {synthesis.branch === 'count' && synthesis.queries.length > 0 && (
        <CountQueries queries={synthesis.queries} />
      )}
      {synthesis.branch === 'prose' && plan?.items && plan.items.length > 0 && (
        <ProseSources
          items={plan.items}
          citedIds={synthesis.source_ids}
          onOpen={onOpenQualifiedId}
        />
      )}
    </section>
  )
}

const BRANCH_COPY: Record<
  SanctionsAmaSynthesis['branch'],
  { label: string; blurb: string }
> = {
  entity: {
    label: 'Entity lookup',
    blurb: 'answered by SQL over the current SDN + consolidated lists',
  },
  count: {
    label: 'Count / aggregate',
    blurb: 'computed by SQL over the three sanctions legs — the queries and their rows ship below',
  },
  prose: {
    label: 'Documents',
    blurb: 'synthesized from OFAC guidance + Federal Register sanctions passages',
  },
}

function BranchBadge({
  branch,
  reason,
}: {
  branch: SanctionsAmaSynthesis['branch']
  reason: string | null
}) {
  const copy = BRANCH_COPY[branch]
  return (
    <p className="mb-3 text-xs text-muted-foreground">
      <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground/80">
        {copy.label}
      </span>
      {copy.blurb}
      {reason ? ` · router: ${reason}` : ''}
    </p>
  )
}

/**
 * Cited-entities panel — fetches display rows for the synthesis-returned
 * ids and renders the same table the entity pane uses.
 */
function CitedEntities({
  ids,
  onOpenEntity,
}: {
  ids: readonly number[]
  onOpenEntity: (row: SanctionsEntityDisplayRow) => void
}) {
  const [rows, setRows] = useState<SanctionsEntityDisplayRow[] | null>(null)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const rowsLoading = rows === null && rowsError === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const fetched = await fetchSanctionsEntitiesByIds(ids as number[])
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
        Listed entries cited ({ids.length.toLocaleString()})
      </h3>
      {rowsLoading && (
        <p className="text-xs text-muted-foreground">Loading entries…</p>
      )}
      {rowsError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t load cited entries: {rowsError}
        </p>
      )}
      {rows && rows.length > 0 && (
        <SanctionsEntityRowsTable rows={rows} onOpenEntity={onOpenEntity} />
      )}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          (No matching entries found for the cited ids.)
        </p>
      )}
    </section>
  )
}

/**
 * The count branch's dual output: every query, its SQL, its row count, and
 * its rows — the user can audit exactly what was counted. Failed queries
 * show their error instead of silently vanishing from the answer's basis.
 */
function CountQueries({
  queries,
}: {
  queries: readonly SanctionsCountQueryResult[]
}) {
  return (
    <section className="mt-6 space-y-4 border-t border-border pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        The computation ({queries.length.toLocaleString()}{' '}
        quer{queries.length === 1 ? 'y' : 'ies'})
      </h3>
      {queries.map((q, i) => (
        <div key={i} className="rounded-md border border-border bg-card">
          <div className="flex items-baseline justify-between gap-3 px-3 py-2">
            <span className="text-xs font-medium text-foreground">{q.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {q.error
                ? 'failed'
                : `${q.total_rows.toLocaleString()} row${q.total_rows === 1 ? '' : 's'}${q.was_truncated ? ' (truncated)' : ''}`}
            </span>
          </div>
          <details className="border-t border-border">
            <summary className="cursor-pointer select-none px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
              SQL
            </summary>
            <pre className="overflow-x-auto border-t border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {q.sql}
            </pre>
          </details>
          {q.error ? (
            <p className="border-t border-border px-3 py-2 text-xs text-destructive">
              {q.error}
            </p>
          ) : (
            q.rows.length > 0 && <CountRowsTable rows={q.rows} />
          )}
        </div>
      ))}
    </section>
  )
}

const COUNT_ROWS_SHOWN = 25

/** Generic result-rows table for the count branch — columns come from the
 *  first row's keys (each query defines its own shape). */
function CountRowsTable({ rows }: { rows: readonly Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] ?? {})
  if (cols.length === 0) return null
  const shown = rows.slice(0, COUNT_ROWS_SHOWN)
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 align-top text-foreground/90">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="border-t border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
          … {rows.length - shown.length} more rows in the response (export the
          PDF for the narrative; the full rows ride in the usage log).
        </p>
      )}
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * The prose branch's sources — the passages synthesis drew from, cited
 * first. Rows open the underlying document (guidance sheet or FR sheet by
 * leg). When citation parsing failed server-side (the salvage path),
 * everything shows as the retrieval set.
 */
function ProseSources({
  items,
  citedIds,
  onOpen,
}: {
  items: readonly SanctionsProseItem[]
  citedIds: readonly string[]
  onOpen: (id: string) => void
}) {
  const cited = new Set(citedIds)
  const citedItems = items.filter((it) => cited.has(it.id))
  const rest = items.filter((it) => !cited.has(it.id))
  return (
    <section className="mt-6 space-y-4 border-t border-border pt-4">
      {citedItems.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cited sources ({citedItems.length.toLocaleString()})
          </h3>
          <SourceList items={citedItems} onOpen={onOpen} />
        </div>
      )}
      {rest.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
            {citedItems.length > 0
              ? `Also retrieved, not cited (${rest.length.toLocaleString()})`
              : `Retrieved passages (${rest.length.toLocaleString()})`}
          </summary>
          <div className="mt-2">
            <SourceList items={rest} onOpen={onOpen} />
          </div>
        </details>
      )}
    </section>
  )
}

function SourceList({
  items,
  onOpen,
}: {
  items: readonly SanctionsProseItem[]
  onOpen: (id: string) => void
}) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onOpen(it.id)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-left hover:border-primary/50 hover:bg-muted/30"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-foreground">
                {it.title}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {it.id.startsWith('fr:') ? 'Federal Register' : 'OFAC guidance'}
                {it.context ? ` · ${it.context}` : ''}
                {it.date ? ` · ${it.date}` : ''}
              </span>
            </span>
            {it.snippet && (
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {it.snippet}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function PlanDisclosure({ plan }: { plan: SanctionsAmaPlan }) {
  const queries = plan.queries ?? []
  const summaryLabel =
    plan.branch === 'prose'
      ? `Plan (prose · ${(plan.items ?? []).length.toLocaleString()} passages retrieved)`
      : `Plan (${plan.branch}${plan.output_mode ? ` · ${plan.output_mode}` : ''} · ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'})`
  return (
    <details className="mb-3 rounded-md border border-border bg-card">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        {summaryLabel}
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-xs text-foreground/90">
        <p className="leading-relaxed">
          {plan.approach_summary ||
            (plan.branch === 'prose'
              ? 'Hybrid retrieval (semantic + keyword) over OFAC guidance and the Federal Register sanctions slice; synthesis cites only the retrieved passages.'
              : '(no plan summary)')}
        </p>
        {queries.length > 0 && (
          <ol className="list-decimal space-y-2 pl-5">
            {queries.map((q, i) => (
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

/** Same markdown register as the other spokes' AMA panels. */
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
