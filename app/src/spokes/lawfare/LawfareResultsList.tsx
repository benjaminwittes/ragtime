import type { LawfareArticleDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'

/**
 * Lawfare manual-filter results list.
 *
 * Each result is a card (not a dense table) — Lawfare items have a dek and a
 * byline that read better as a stacked card than as table cells: title,
 * byline (author_names joined), published date, a content-type badge, topic
 * chips, and a dek snippet. Click a card → article reader detail sheet. The
 * trailing ↗ links out to the canonical lawfaremedia.org URL.
 *
 * The card-rendering body is exported separately as `LawfareArticleRowsList`
 * so the AMA result panel can render the same shape on cited articles without
 * duplicating the layout (mirrors OLC's OlcOpinionRowsTable).
 */
export function LawfareResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenArticle,
  semanticMatchIds,
}: {
  rows: readonly LawfareArticleDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenArticle: (row: LawfareArticleDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by keyword, author, topic, content type, or date to find
          Lawfare pieces.
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
      <div className="space-y-4 px-6 py-8">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-sm text-destructive">Filter failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="space-y-4 px-6 py-8">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-center text-sm text-muted-foreground">
          No pieces matched. Try broadening the filter.
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()} pieces · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <LawfareArticleRowsList
        rows={rows}
        onOpenArticle={onOpenArticle}
        semanticMatchIds={semanticMatchIds}
      />
    </div>
  )
}

/**
 * Just the cards — no surrounding chrome. Reused by both the manual-filter
 * results list above and the AMA cited-articles panel, so cited items render
 * exactly like filter results (mirrors OLC's OlcOpinionRowsTable).
 */
export function LawfareArticleRowsList({
  rows,
  onOpenArticle,
  semanticMatchIds,
}: {
  rows: readonly LawfareArticleDisplayRow[]
  onOpenArticle: (row: LawfareArticleDisplayRow) => void
  /** Ids also present in the semantic pane (brief #9: overlap badged in
   *  both panes). Undefined when no semantic search ran. */
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenArticle(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenArticle(r)
              }
            }}
            aria-label={`Open ${r.title ?? 'piece ' + r.id} in the reader`}
            className="cursor-pointer rounded-md border border-border bg-card p-4 hover:bg-muted/40 focus:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-serif text-base font-semibold leading-snug text-foreground">
                {r.title ?? '(untitled)'}
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                {semanticMatchIds?.has(String(r.id)) && (
                  <AlsoMatchBadge kind="semantic" />
                )}
                {r.content_type && <ContentTypeBadge value={r.content_type} />}
                <SourceLink row={r} />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {byline(r.author_names)}
              {r.published_date && (
                <>
                  {r.author_names.length > 0 && ' · '}
                  <span className="font-mono">{r.published_date}</span>
                </>
              )}
              {r.series && (
                <>
                  {' · '}
                  <span className="italic">{r.series}</span>
                </>
              )}
            </p>
            {r.dek && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/80">
                {r.dek}
              </p>
            )}
            {r.topic_names.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.topic_names.map((t) => (
                  <TopicChip key={t} label={t} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function byline(authors: readonly string[]): string {
  if (!authors || authors.length === 0) return 'Lawfare'
  return authors.join(', ')
}

/** "↗" affordance to the canonical lawfaremedia.org URL. `stopPropagation`
 *  prevents the card's open-in-reader handler from firing on the link. */
function SourceLink({ row }: { row: LawfareArticleDisplayRow }) {
  if (!row.canonical_url) return null
  return (
    <a
      href={row.canonical_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open this piece on Lawfare in a new tab"
      aria-label={`Open ${row.title ?? 'piece ' + row.id} on Lawfare in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function ContentTypeBadge({ value }: { value: string }) {
  const label =
    value === 'article'
      ? 'Article'
      : value === 'podcast'
        ? 'Podcast'
        : value === 'newsletter'
          ? 'Newsletter'
          : value
  const accent =
    value === 'podcast'
      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : value === 'newsletter'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${accent}`}
      title={`Content type: ${label}`}
    >
      {label}
    </span>
  )
}

function TopicChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  )
}

function ExecutedSqlDisclosure({ sql }: { sql: string }) {
  return (
    <details className="mb-3 rounded-md border border-border bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        Executed SQL
      </summary>
      <div className="border-t border-border p-3">
        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {sql}
        </pre>
      </div>
    </details>
  )
}
