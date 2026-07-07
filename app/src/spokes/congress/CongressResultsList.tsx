import type {
  CongressAnyDisplayRow,
  CongressBillDisplayRow,
  CongressCollection,
  CongressHearingDisplayRow,
  CongressLawDisplayRow,
  CongressRecordDisplayRow,
  CongressTestimonyDisplayRow,
} from '@/lib/worker-client'
import { AlsoMatchBadge } from '../components/SemanticResultsList'
import {
  billCitation,
  collectionNoun,
  ordinal,
  prettyGranuleClass,
} from './congress-format'

/**
 * Congress manual-filter results — one table shape per collection:
 *   laws      — PL number · title · kind · approved · Stat. cite
 *   bills     — citation · title (+became-law chip) · sponsor · introduced · latest action
 *   hearings  — title · chamber · committee · held · congress
 *   record    — title · section · date · speaking members
 *   testimony — witness · type · committee · date · ↗ PDF
 *
 * The table is exported separately as `CongressRowsTable` so the AMA
 * cited-documents panel renders the identical shape per collection.
 */
export function CongressResultsList({
  collection,
  rows,
  count,
  loading,
  error,
  hasRun,
  executedSql,
  onOpenDocument,
  semanticMatchIds,
}: {
  collection: CongressCollection
  rows: readonly CongressAnyDisplayRow[] | undefined
  count: number | undefined
  loading: boolean
  error: string | undefined
  hasRun: boolean
  executedSql: string | undefined
  onOpenDocument: (row: CongressAnyDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  if (!hasRun && !loading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Filter by text, Congress, committee, chamber, or date to search this
          collection.
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
    return (
      <div className="px-6 py-8 space-y-4">
        {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
        <p className="text-center text-sm text-muted-foreground">
          No matches in this collection. Try broadening the filter — or switch
          collections above (coverage varies: floor debate starts 1994, bill
          text 2013, written testimony the 118th Congress).
        </p>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {executedSql && <ExecutedSqlDisclosure sql={executedSql} />}
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {(count ?? rows.length).toLocaleString()}{' '}
        {collectionNoun(collection, count ?? rows.length)} · showing first{' '}
        {rows.length.toLocaleString()}
      </p>
      <CongressRowsTable
        collection={collection}
        rows={rows}
        onOpenDocument={onOpenDocument}
        semanticMatchIds={semanticMatchIds}
      />
    </div>
  )
}

/**
 * Just the table — reused by the manual-filter results list above and the
 * AMA cited-documents panel, so cited rows match filter rows exactly.
 */
export function CongressRowsTable({
  collection,
  rows,
  onOpenDocument,
  semanticMatchIds,
}: {
  collection: CongressCollection
  rows: readonly CongressAnyDisplayRow[]
  onOpenDocument: (row: CongressAnyDisplayRow) => void
  semanticMatchIds?: ReadonlySet<string>
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <HeaderRow collection={collection} />
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDocument(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenDocument(r)
                }
              }}
              aria-label={`Open item ${r.id} in detail panel`}
              className="cursor-pointer hover:bg-muted/40 focus:bg-muted/60 focus:outline-none"
            >
              <BodyCells
                collection={collection}
                row={r}
                alsoSemantic={semanticMatchIds?.has(String(r.id)) ?? false}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeaderRow({ collection }: { collection: CongressCollection }) {
  switch (collection) {
    case 'laws':
      return (
        <tr>
          <Th>Public law</Th>
          <Th>Title</Th>
          <Th>Kind</Th>
          <Th>Approved</Th>
          <Th>Statute cite</Th>
        </tr>
      )
    case 'bills':
      return (
        <tr>
          <Th>Bill</Th>
          <Th>Title</Th>
          <Th>Sponsor</Th>
          <Th>Introduced</Th>
          <Th>Latest action</Th>
        </tr>
      )
    case 'hearings':
      return (
        <tr>
          <Th>Title</Th>
          <Th>Chamber</Th>
          <Th>Committee</Th>
          <Th>Held</Th>
          <Th>Congress</Th>
        </tr>
      )
    case 'record':
      return (
        <tr>
          <Th>Title</Th>
          <Th>Section</Th>
          <Th>Date</Th>
          <Th>Speaking members</Th>
        </tr>
      )
    case 'testimony':
      return (
        <tr>
          <Th>Witness</Th>
          <Th>Type</Th>
          <Th>Committee</Th>
          <Th>Date</Th>
          <Th className="text-right" aria-label="External link" />
        </tr>
      )
  }
}

function BodyCells({
  collection,
  row,
  alsoSemantic,
}: {
  collection: CongressCollection
  row: CongressAnyDisplayRow
  alsoSemantic: boolean
}) {
  const badge = alsoSemantic ? (
    <span className="ml-2 inline-block align-middle">
      <AlsoMatchBadge kind="semantic" />
    </span>
  ) : null

  switch (collection) {
    case 'laws': {
      const r = row as CongressLawDisplayRow
      return (
        <>
          <Td className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
            {r.pl_number ?? '—'}
          </Td>
          <Td>
            <span className="text-foreground">{stripPlPrefix(r.title)}</span>
            {badge}
          </Td>
          <Td>
            <QuietBadge value={r.law_kind} />
          </Td>
          <Td className="font-mono text-xs">{r.approved_date ?? '—'}</Td>
          <Td className="whitespace-nowrap font-mono text-xs">
            {r.statute_citation ?? '—'}
          </Td>
        </>
      )
    }
    case 'bills': {
      const r = row as CongressBillDisplayRow
      return (
        <>
          <Td className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
            {billCitation(r)}
          </Td>
          <Td>
            <span className="text-foreground">{r.title ?? '(no title)'}</span>
            {badge}
            {r.became_law === true && <BecameLawChip />}
          </Td>
          <Td className="text-xs text-muted-foreground">
            {r.sponsor_names?.[0] ?? '—'}
          </Td>
          <Td className="font-mono text-xs">{r.introduced_date ?? '—'}</Td>
          <Td className="font-mono text-xs">{r.latest_action_date ?? '—'}</Td>
        </>
      )
    }
    case 'hearings': {
      const r = row as CongressHearingDisplayRow
      return (
        <>
          <Td>
            <span className="text-foreground">{r.title ?? '(no title)'}</span>
            {badge}
          </Td>
          <Td className="text-xs text-muted-foreground">{r.chamber ?? '—'}</Td>
          <Td className="text-xs text-muted-foreground">
            {formatList(r.committee_names)}
          </Td>
          <Td className="font-mono text-xs">{r.held_date ?? '—'}</Td>
          <Td className="font-mono text-xs">
            {r.congress != null ? ordinal(r.congress) : '—'}
          </Td>
        </>
      )
    }
    case 'record': {
      const r = row as CongressRecordDisplayRow
      return (
        <>
          <Td>
            <span className="text-foreground">{r.title ?? '(no title)'}</span>
            {badge}
          </Td>
          <Td>
            <QuietBadge value={prettyGranuleClass(r.granule_class)} />
          </Td>
          <Td className="font-mono text-xs">{r.record_date ?? '—'}</Td>
          <Td className="text-xs text-muted-foreground">
            {r.member_names && r.member_names.length > 0
              ? `${r.member_names.length.toLocaleString()}`
              : '—'}
          </Td>
        </>
      )
    }
    case 'testimony': {
      const r = row as CongressTestimonyDisplayRow
      return (
        <>
          <Td className="font-medium text-foreground">
            {r.witness ?? '—'}
            {badge}
          </Td>
          <Td>
            <QuietBadge value={r.doc_type} />
          </Td>
          <Td className="font-mono text-xs">{r.committee_code ?? '—'}</Td>
          <Td className="font-mono text-xs">{r.statement_date ?? '—'}</Td>
          <Td className="text-right">
            <ExternalLink href={r.url} />
          </Td>
        </>
      )
    }
  }
}

/** 'Public Law 95–511: To authorize…' → 'To authorize…' (the PL number
 * already has its own column). */
function stripPlPrefix(title: string | null): string {
  if (!title) return '(no title)'
  return title.replace(/^Public Law [\d–-]+:\s*/, '')
}

/** First two names; "+n" for the rest. */
function formatList(names: string[] | null): string {
  if (!names || names.length === 0) return '—'
  const shown = names.slice(0, 2).join(' · ')
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown
}

export function BecameLawChip() {
  return (
    <span
      className="ml-2 inline-block whitespace-nowrap rounded bg-emerald-500/10 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
      title="This bill was enacted into law"
    >
      became law
    </span>
  )
}

export function QuietBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/50">—</span>
  return (
    <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      {value}
    </span>
  )
}

function ExternalLink({ href }: { href: string | null }) {
  if (!href) return <span className="text-muted-foreground/50">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open the source PDF in a new tab"
      aria-label="Open the source PDF in a new tab"
      className="inline-block text-primary hover:underline"
    >
      ↗
    </a>
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

function Th({
  children,
  className,
  'aria-label': ariaLabel,
}: {
  children?: React.ReactNode
  className?: string
  'aria-label'?: string
}) {
  return (
    <th
      aria-label={ariaLabel}
      className={'px-3 py-2 text-left font-medium ' + (className ?? '')}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td className={'px-3 py-2 align-top ' + (className ?? '')}>{children}</td>
  )
}
