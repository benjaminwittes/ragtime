import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type {
  AmaOutputMode,
  AnalysisAnnotation,
  CaseDisplayRow,
} from '@/lib/worker-client'

/**
 * How a result page was produced. Drives the "How this was produced"
 * disclosure rendered above the table — surfaces the executed SQL (for
 * manual_filter) or the model's generated SQL + the user's prompt + the
 * model's label (for claude_sql). Per brief #6 §7b item 3, the generated
 * SQL is always visible, not just on error.
 */
export type ResultSource =
  | {
      kind: 'manual_filter'
      generatedSql: string
    }
  | {
      kind: 'claude_sql'
      prompt: string
      label: string
      generatedSql: string
      /** True when the run failed but the model still produced SQL. */
      errored?: boolean
    }
  | {
      kind: 'claude_read'
      criterion: string
      /** Total cases read (incoming scope size). */
      incomingCount: number
      /** Cases the AI judged keep===true (= rows.length after filtering). */
      keptCount: number
      /** Per-case verdict map. Drives the keep/drop badge + reason per row. */
      verdicts: Record<number, { keep: boolean; reason: string }>
    }
  | {
      kind: 'claude_analysis'
      /** The user's analytical prompt. */
      prompt: string
      /** The model's narrative markdown. Rendered in a top disclosure
       *  (default open) above the case list. Case references use the
       *  `[Case Name](#case-<cl_id>)` syntax from the Worker's system
       *  prompt; intra-page anchors wire via row id attributes. */
      markdown: string
      /** Per-case annotations keyed by cl_id. Drives optional columns
       *  (rank / score / category / label) — only the present fields
       *  render. */
      annotations: Record<number, AnalysisAnnotation>
      /** Cases analyzed (= rows.length; analyze never narrows). */
      analyzedCount: number
    }
  | {
      kind: 'claude_ama'
      /** The user's question. */
      question: string
      /** Plan shape the agent chose. Drives the disclosure copy. */
      outputMode: AmaOutputMode
      /** Plain-English plan summary from the planning step. */
      planSummary: string
      /** Combined candor notes from plan + synthesis. */
      candorNotes: string[]
      /** Synthesis markdown — same shape as claude_analysis (uses
       *  `[Case Name](#case-<cl_id>)` anchors). */
      answerMarkdown: string
      /** Cases the agent considered (incoming scope, or the full corpus
       *  size when there was no prior page). */
      incomingCount: number
      /** Cases in the result page (= rows.length). For list/hybrid this is
       *  the narrowed subset; for narrative it's the pass-through. */
      outgoingCount: number
      /** True when the synthesis narrowed the field. */
      narrowed: boolean
    }

/**
 * Result page — case rows + optional "how this was produced" disclosure.
 * Per brief #6 §6 modifications, the stack affordances (breadcrumb, page
 * band) are hidden until at least one operation has produced a page; the
 * empty pre-run state shows just a quiet prompt.
 */
export function ResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  source,
  onOpenCase,
}: {
  rows: readonly CaseDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  /** Whether the user has executed any filter yet. False on first paint. */
  hasRun: boolean
  /** How the current result page was produced. Undefined on pre-run or
   *  when the previous run errored without producing SQL. */
  source?: ResultSource
  /** Click handler for "open this case in the detail sheet". v1 just opens
   *  the sheet inline; the stack runtime (PR 4g) will replace this with
   *  a stack-push that records the detail as its own page. */
  onOpenCase: (row: CaseDisplayRow) => void
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Set filter criteria above and click <span className="font-medium">Apply filter</span> to
          produce a result page.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Filtering…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-6 py-8 space-y-4">
        {source && <SourceDisclosure source={source} />}
        <p className="text-sm text-destructive">Query failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-6 py-8 space-y-4">
        {source && <SourceDisclosure source={source} />}
        <p className="text-center text-sm text-muted-foreground">
          No cases matched. Try broadening the query.
        </p>
      </div>
    )
  }

  // Per-case annotation columns for claude_analysis — only show columns
  // where at least one row has a value (the model omits annotations on
  // descriptive prompts, and may include only a subset of the four fields).
  const annotationCols = computeAnnotationCols(source, rows)

  return (
    <div className="px-6 py-4">
      {source && <SourceDisclosure source={source} />}
      {source?.kind === 'claude_analysis' && (
        <AnalysisNarrative markdown={source.markdown} />
      )}
      {source?.kind === 'claude_ama' && (
        <AnalysisNarrative title="Answer" markdown={source.answerMarkdown} />
      )}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} cases · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <Th>Case</Th>
              <Th>Docket</Th>
              <Th>Court</Th>
              <Th>Judge</Th>
              <Th>Filed</Th>
              <Th>Cause</Th>
              <Th className="text-right">Entries</Th>
              {source?.kind === 'claude_read' && <Th>AI reason</Th>}
              {annotationCols.includes('rank') && (
                <Th className="text-right">Rank</Th>
              )}
              {annotationCols.includes('score') && (
                <Th className="text-right">Score</Th>
              )}
              {annotationCols.includes('category') && <Th>Category</Th>}
              {annotationCols.includes('label') && <Th>Label</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const verdict =
                source?.kind === 'claude_read'
                  ? source.verdicts[r.cl_id]
                  : undefined
              const annotation =
                source?.kind === 'claude_analysis'
                  ? source.annotations[r.cl_id]
                  : undefined
              return (
                <tr
                  key={r.cl_id}
                  id={`case-${r.cl_id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenCase(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenCase(r)
                    }
                  }}
                  aria-label={`Open ${r.case_name ?? 'case ' + r.cl_id} in detail panel`}
                  className="cursor-pointer scroll-mt-20 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none target:bg-primary/10"
                >
                  <Td>
                    <span className="font-medium text-foreground">
                      {r.case_name ?? '(no name)'}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">
                    {r.docket_number ?? '—'}
                  </Td>
                  <Td className="font-mono text-xs uppercase">
                    {r.court ?? '—'}
                  </Td>
                  <Td className="text-xs">{r.judge ?? '—'}</Td>
                  <Td className="font-mono text-xs">{r.date_filed ?? '—'}</Td>
                  <Td
                    className="max-w-xs truncate text-xs"
                    title={r.cause ?? undefined}
                  >
                    {shortCause(r.cause)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {r.entry_count ?? '—'}
                  </Td>
                  {source?.kind === 'claude_read' && (
                    <Td className="max-w-sm text-xs text-muted-foreground">
                      {verdict?.reason ?? '—'}
                    </Td>
                  )}
                  {annotationCols.includes('rank') && (
                    <Td className="text-right font-mono text-xs tabular-nums">
                      {annotation?.rank ?? '—'}
                    </Td>
                  )}
                  {annotationCols.includes('score') && (
                    <Td className="text-right font-mono text-xs tabular-nums">
                      {annotation?.score ?? '—'}
                    </Td>
                  )}
                  {annotationCols.includes('category') && (
                    <Td className="max-w-xs truncate text-xs">
                      {annotation?.category ?? '—'}
                    </Td>
                  )}
                  {annotationCols.includes('label') && (
                    <Td className="max-w-sm text-xs">
                      {annotation?.label ?? '—'}
                    </Td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Top-of-result narrative block for claude_analysis. Renders the model's
 * markdown via react-markdown. Case references in the markdown use the
 * `[Case Name](#case-<cl_id>)` syntax (per the Worker's analysis system
 * prompt) — we let them render as native anchor links; the rows below have
 * matching `id="case-<cl_id>"` attributes so the browser scrolls to the row
 * and CSS `:target` highlights it briefly.
 *
 * Default open. Always-visible disclosure pattern so users see the full
 * narrative without an extra click, but they can collapse it if they want
 * to skim the table.
 */
function AnalysisNarrative({
  markdown,
  title = 'Analysis',
}: {
  markdown: string
  title?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-card"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40">
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-5 py-4 text-sm text-foreground">
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </div>
    </details>
  )
}

/**
 * Explicit element styling for the narrative markdown. Tailwind v4 doesn't
 * ship the `prose` utilities (those are v3's @tailwindcss/typography), so
 * we style each element directly. Matches the editorial register of the
 * legacy spoke surface — serif headings, primary-color links, monospace
 * inline code.
 */
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
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
      {...props}
    />
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="my-4 border-border" {...props} />
  ),
}

/**
 * Compute which annotation columns to render — only those where at least
 * one row has a value. Avoids rendering "—" columns for analyses where the
 * model didn't use a particular dimension.
 */
function computeAnnotationCols(
  source: ResultSource | undefined,
  rows: readonly CaseDisplayRow[],
): Array<'rank' | 'score' | 'category' | 'label'> {
  if (source?.kind !== 'claude_analysis') return []
  const cols: Array<'rank' | 'score' | 'category' | 'label'> = []
  if (rows.some((r) => source.annotations[r.cl_id]?.rank != null))
    cols.push('rank')
  if (rows.some((r) => source.annotations[r.cl_id]?.score != null))
    cols.push('score')
  if (rows.some((r) => source.annotations[r.cl_id]?.category != null))
    cols.push('category')
  if (rows.some((r) => source.annotations[r.cl_id]?.label != null))
    cols.push('label')
  return cols
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={
        'px-3 py-2 text-left font-medium ' + (className ?? '')
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <td className={'px-3 py-2 align-top ' + (className ?? '')} title={title}>
      {children}
    </td>
  )
}

function shortCause(c: string | null | undefined): string {
  if (!c) return '—'
  return c.length > 40 ? c.substring(0, 38) + '…' : c
}

function amaTitle(source: Extract<ResultSource, { kind: 'claude_ama' }>): string {
  const shape =
    source.outputMode === 'list'
      ? 'list'
      : source.outputMode === 'hybrid'
        ? 'narrative + list'
        : 'narrative'
  if (source.narrowed) {
    return `AMA (${shape}) — considered ${source.incomingCount.toLocaleString()} · kept ${source.outgoingCount.toLocaleString()}`
  }
  return `AMA (${shape}) — considered ${source.incomingCount.toLocaleString()} cases`
}

/**
 * Collapsible "How this was produced" disclosure. For manual_filter, shows
 * the executed SQL. For claude_sql, shows the user's prompt, the model's
 * one-line label, and the generated SQL. Per brief #6 §7b item 3, the
 * generated SQL is always visible (not just on error).
 *
 * Defaults closed for manual_filter (most users don't need to see the
 * mechanical filter SQL) and open for claude_sql (the auditability stakes
 * are higher when the AI wrote it).
 */
function SourceDisclosure({ source }: { source: ResultSource }) {
  const [open, setOpen] = useState(
    source.kind === 'claude_sql' ||
      source.kind === 'claude_read' ||
      source.kind === 'claude_analysis' ||
      source.kind === 'claude_ama',
  )
  const title =
    source.kind === 'claude_sql'
      ? source.errored
        ? 'How this was produced (failed)'
        : 'How this was produced'
      : source.kind === 'claude_read'
        ? `AI read ${source.incomingCount.toLocaleString()} cases · kept ${source.keptCount.toLocaleString()}`
        : source.kind === 'claude_analysis'
          ? `AI analyzed ${source.analyzedCount.toLocaleString()} cases`
          : source.kind === 'claude_ama'
            ? amaTitle(source)
            : 'Executed SQL'

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="mb-3 rounded-md border border-border bg-muted/30"
    >
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        {title}
      </summary>
      <div className="space-y-2 border-t border-border p-3 text-xs">
        {source.kind === 'claude_sql' && (
          <>
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Your prompt
              </span>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {source.prompt}
              </p>
            </div>
            {source.label && (
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Operation label
                </span>
                <p className="mt-1 font-mono text-foreground">{source.label}</p>
              </div>
            )}
          </>
        )}
        {source.kind === 'claude_read' && (
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Criterion
            </span>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {source.criterion}
            </p>
          </div>
        )}
        {source.kind === 'claude_analysis' && (
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Analytical prompt
            </span>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {source.prompt}
            </p>
          </div>
        )}
        {source.kind === 'claude_ama' && (
          <>
            <div>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Question
              </span>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {source.question}
              </p>
            </div>
            {source.planSummary && (
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Plan
                </span>
                <p className="mt-1 leading-relaxed text-foreground/90">
                  {source.planSummary}
                </p>
              </div>
            )}
            {source.candorNotes.length > 0 && (
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Candor notes
                </span>
                <ul className="mt-1 list-disc pl-5 leading-relaxed text-muted-foreground">
                  {source.candorNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {(source.kind === 'claude_sql' || source.kind === 'manual_filter') && (
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Generated SQL
            </span>
            <pre className="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
              {source.generatedSql}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}
