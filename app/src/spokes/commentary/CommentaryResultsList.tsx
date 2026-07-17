import type { CommentaryDisplayRow } from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'

/** Publication-qualified key ('lawfare:123') — the shape the semantic pane and
 *  the union filter share, used for cross-pane overlap badging and React keys. */
export function commentaryRowKey(r: {
  publication: string
  id: number
}): string {
  return `${r.publication}:${r.id}`
}

/**
 * Commentary manual-filter results list.
 *
 * Each result is a card (not a dense table): a Publication badge (Lawfare /
 * Executive Functions), title, byline (authors joined), published date, a
 * content-type badge, a subtitle snippet, and topic chips (Lawfare only —
 * Executive Functions rows have no topics). Click a card → the piece reader
 * detail sheet, keyed on {publication, id}. The trailing ↗ links out to the
 * canonical source URL (the link-back rule).
 *
 * The card-rendering body is exported separately as `CommentaryRowsList` so the
 * AMA result panel can render the same shape on cited pieces without
 * duplicating the layout (mirrors Lawfare's LawfareArticleRowsList).
 */
export function CommentaryResultsList({
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchKeys,
}: {
  rows: readonly CommentaryDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: CommentaryDisplayRow) => void
  /** Publication-qualified keys ('lawfare:123') also present in the semantic
   *  pane. Undefined when no semantic search ran. */
  semanticMatchKeys?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by keyword, publication, author, content type, or date to find
          commentary pieces.
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
      <CommentaryRowsList
        rows={rows}
        onOpenDocument={onOpenDocument}
        semanticMatchKeys={semanticMatchKeys}
      />
    </div>
  )
}

/**
 * Just the cards — no surrounding chrome. Reused by both the manual-filter
 * results list above and the AMA cited-pieces panel, so cited items render
 * exactly like filter results.
 */
export function CommentaryRowsList({
  rows,
  onOpenDocument,
  semanticMatchKeys,
}: {
  rows: readonly CommentaryDisplayRow[]
  onOpenDocument: (row: CommentaryDisplayRow) => void
  semanticMatchKeys?: ReadonlySet<string>
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={commentaryRowKey(r)}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenDocument(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpenDocument(r)
              }
            }}
            aria-label={`Open ${r.title ?? 'piece ' + r.id} in the reader`}
            className="cursor-pointer rounded-md border border-border bg-card p-4 hover:bg-muted/40 focus:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <PublicationBadge value={r.publication} />
                <h3 className="font-serif text-base font-semibold leading-snug text-foreground">
                  {r.title ?? '(untitled)'}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {semanticMatchKeys?.has(commentaryRowKey(r)) && (
                  <AlsoMatchBadge kind="semantic" />
                )}
                {r.post_type && <PostTypeBadge value={r.post_type} />}
                <SourceLink row={r} />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {byline(r.authors)}
              {r.published_date && (
                <>
                  {(r.authors?.length ?? 0) > 0 && ' · '}
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
            {r.subtitle && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground/80">
                {r.subtitle}
              </p>
            )}
            {r.topic_names && r.topic_names.length > 0 && (
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

function byline(authors: readonly string[] | null): string {
  if (!authors || authors.length === 0) return 'Commentary'
  return authors.join(', ')
}

/** "↗" affordance to the canonical source URL. `stopPropagation` prevents the
 *  card's open-in-reader handler from firing on the link. */
function SourceLink({ row }: { row: CommentaryDisplayRow }) {
  if (!row.source_url) return null
  return (
    <a
      href={row.source_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open this piece at its source in a new tab"
      aria-label={`Open ${row.title ?? 'piece ' + row.id} at its source in a new tab`}
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
  )
}

function PublicationBadge({ value }: { value: string }) {
  const label = value === 'lawfare' ? 'Lawfare' : 'Executive Functions'
  const accent =
    value === 'lawfare'
      ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${accent}`}
      title={`Publication: ${label}`}
    >
      {label}
    </span>
  )
}

function PostTypeBadge({ value }: { value: string }) {
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  const accent =
    value === 'podcast'
      ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : value === 'newsletter' || value === 'roundup'
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
