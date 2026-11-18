import type { StateCodeSectionDisplayRow, StateCodesMember } from '@lawfare/ragtime-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import { ResultWindow } from '../components/ResultWindow'
import { SearchedAs } from '../components/SearchedAs'
import { FALLBACK_NOTICE, showsFallback, type BoxFallbackView } from '@/lib/box-fallback'
import {
  breakdownWords,
  isInForce,
  notInForceBreakdown,
  rowCitation,
  semanticRowsToSections,
  sectionRowKey,
  statusExplanation,
  statusLabel,
} from './state-codes-format'

/**
 * State Codes manual-filter results table.
 *
 * Columns: Citation (with status and temporary-text flags) · Heading · Title ·
 * Law through. Every section that is not in force carries its status badge,
 * and a recodified one names the section its rule moved to. Above the table,
 * the not-in-force line (query design rules 1 and 3): when the match holds
 * sections that are not in force, it says how many and offers to hide them;
 * when they are hidden, it says how many were left out and offers to show
 * them.
 *
 * The hybrid fallback (no section holds every word) is shown in this same
 * table, not the shared FallbackResults list, so its rows keep their status
 * flags too.
 *
 * No "Save to Recordbench" yet: the bench saves by corpus slug, and
 * state_codes is not a registered corpus.
 */
export function StateCodesResultsList({
  member,
  rows,
  count,
  loading,
  error,
  hasRun,
  searchedAs,
  fallback,
  executedSql,
  statusCounts,
  inForceOnly,
  onSetInForceOnly,
  onOpenSection,
  semanticMatchIds,
}: {
  /** The member searched: a plain fallback id is read as this member's. */
  member: StateCodesMember
  rows: readonly StateCodeSectionDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  /** The "Searched as" line (lib/searched-as.ts), shown under the count. */
  searchedAs?: string | null
  executedSql: string | undefined
  /** The reply's status_counts: the whole match, before any exclusion. */
  statusCounts?: Partial<Record<string, number>>
  /** Whether the search that produced these rows left out not-in-force sections. */
  inForceOnly: boolean
  /** Re-run the same search with not-in-force sections hidden or shown. */
  onSetInForceOnly?: (inForceOnly: boolean) => void
  onOpenSection: (row: StateCodeSectionDisplayRow) => void
  /** Keys ('dc:123') the semantic pane also found. */
  semanticMatchIds?: ReadonlySet<string>
  /** Hybrid search's results when keyword search found nothing. */
  fallback?: BoxFallbackView
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Look up a section by number, search the text, or filter by title,
          chapter and status.
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
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-sm text-destructive">Filter failed: {error}</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    if (showsFallback(fallback)) {
      return (
        <StateCodesFallbackResults
          fallback={fallback}
          member={member}
          searchedAs={searchedAs}
          onOpenSection={onOpenSection}
        />
      )
    }
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <NotInForceLine
          statusCounts={statusCounts}
          inForceOnly={inForceOnly}
          onSetInForceOnly={onSetInForceOnly}
        />
        <p className="text-center text-sm text-muted-foreground">
          No sections matched. Try fewer words, another title, or the semantic
          pane to search by meaning.
        </p>
        <SearchedAs line={searchedAs} centered />
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <NotInForceLine
        statusCounts={statusCounts}
        inForceOnly={inForceOnly}
        onSetInForceOnly={onSetInForceOnly}
      />
      <ResultWindow searchedAs={searchedAs} rows={rows} count={count} noun="sections">
        {(visible) => (
          <StateCodeSectionRowsTable
            rows={visible}
            onOpenSection={onOpenSection}
            semanticMatchIds={semanticMatchIds}
          />
        )}
      </ResultWindow>
    </div>
  )
}

/**
 * What the match holds that is not in force, and the way to hide or show it.
 * Says nothing when every matching section is in force.
 */
export function NotInForceLine({
  statusCounts,
  inForceOnly,
  onSetInForceOnly,
}: {
  statusCounts?: Partial<Record<string, number>>
  inForceOnly: boolean
  onSetInForceOnly?: (inForceOnly: boolean) => void
}) {
  const { total, parts } = notInForceBreakdown(statusCounts)
  if (total === 0) return null
  const sections = total === 1 ? 'section' : 'sections'
  return (
    <p
      data-testid="not-in-force-line"
      className="mb-3 border-l-2 border-amber-400 bg-amber-500/10 py-2 pl-3 pr-3 text-xs text-amber-900 dark:text-amber-200"
    >
      {inForceOnly ? (
        <>
          Hidden: {total.toLocaleString()} matching {sections} not in force (
          {breakdownWords(parts)}).{' '}
        </>
      ) : (
        <>
          {total.toLocaleString()} of these {sections} {total === 1 ? 'is' : 'are'} not
          in force ({breakdownWords(parts)}), and {total === 1 ? 'is' : 'are'} marked
          below.{' '}
        </>
      )}
      {onSetInForceOnly && (
        <button
          type="button"
          onClick={() => onSetInForceOnly(!inForceOnly)}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {inForceOnly ? 'Show them' : 'Hide them'}
        </button>
      )}
    </p>
  )
}

/** Just the table, so the semantic pane can show the same rows and flags. */
export function StateCodeSectionRowsTable({
  rows,
  onOpenSection,
  semanticMatchIds,
  keywordMatchIds,
  openingKey,
}: {
  rows: readonly StateCodeSectionDisplayRow[]
  onOpenSection: (row: StateCodeSectionDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
  keywordMatchIds?: ReadonlySet<string>
  /** A row being resolved before its sheet opens. */
  openingKey?: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th>Citation</Th>
            <Th>Heading</Th>
            <Th>Title</Th>
            <Th>Law through</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = sectionRowKey(r)
            const citation = rowCitation(r)
            return (
              <tr
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onOpenSection(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenSection(r)
                  }
                }}
                aria-label={`Open ${citation} in detail panel`}
                aria-busy={openingKey === key || undefined}
                className="cursor-pointer border-t border-lawfare-line hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
              >
                <Td>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
                      {citation}
                    </span>
                    {!isInForce(r) && <StatusBadge row={r} />}
                    {r.has_temporary_text && <TemporaryTextChip />}
                    {semanticMatchIds?.has(key) && <AlsoMatchBadge kind="semantic" />}
                    {keywordMatchIds?.has(key) && <AlsoMatchBadge kind="keyword" />}
                  </div>
                  {r.recodified_to && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Rule now at § {r.recodified_to}
                    </p>
                  )}
                </Td>
                <Td className="text-xs text-foreground">{r.heading ?? '—'}</Td>
                <Td className="text-xs text-muted-foreground">
                  {r.title_num != null ? (
                    <>
                      <span className="font-mono">{r.title_num}</span>
                      {r.title_name && <span className="ml-1.5">· {r.title_name}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                  {r.codified_date ?? '—'}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The status badge for a section that is not in force. Rendered for every
 * status but exactly 'in_force', a missing one included.
 */
export function StatusBadge({
  row,
}: {
  row: { status?: string | null; applicable_on?: string | null; recodified_to?: string | null }
}) {
  if (isInForce(row)) return null
  const label =
    row.status === 'not_yet_applicable' && row.applicable_on
      ? `Applies from ${row.applicable_on}`
      : statusLabel(row.status)
  return (
    <span
      data-status={row.status ?? 'unknown'}
      className="inline-block whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300"
      title={statusExplanation(row) ?? undefined}
    >
      {label}
    </span>
  )
}

/** Marks a section whose current text includes emergency or temporary law. */
export function TemporaryTextChip() {
  return (
    <span
      className="inline-block whitespace-nowrap rounded bg-sky-500/10 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-sky-800 dark:text-sky-300"
      title="The current text includes emergency or temporary legislation, which may expire."
    >
      temporary text
    </span>
  )
}

/**
 * The keyword pane's empty branch when hybrid search found something: the
 * same notice the shared FallbackResults shows, over the section table.
 */
export function StateCodesFallbackResults({
  fallback,
  member,
  searchedAs,
  onOpenSection,
}: {
  fallback: BoxFallbackView
  member: StateCodesMember
  searchedAs?: string | null
  onOpenSection: (row: StateCodeSectionDisplayRow) => void
}) {
  if (!showsFallback(fallback)) return null
  return (
    <div data-testid="box-fallback" className="pt-4">
      <div className="px-6">
        <SearchedAs line={searchedAs} />
        <p className="mt-1 text-sm text-muted-foreground">{FALLBACK_NOTICE}</p>
      </div>
      <div className="px-6 py-4">
        <StateCodeSectionRowsTable
          rows={semanticRowsToSections(fallback.reply.results, member)}
          onOpenSection={onOpenSection}
        />
      </div>
    </div>
  )
}

function ExecutedSqlDisclosure({ sql }: { sql: string }) {
  return (
    <details className="mb-3 border-t border-lawfare-line bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/60">
        Executed SQL
      </summary>
      <div className="border-t border-lawfare-line p-3">
        <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {sql}
        </pre>
      </div>
    </details>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-3 py-2 text-left font-medium ' + (className ?? '')}>{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={'px-3 py-2 align-top ' + (className ?? '')}>{children}</td>
}
