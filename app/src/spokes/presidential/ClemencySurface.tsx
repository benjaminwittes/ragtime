import { useEffect, useState } from 'react'
import {
  type ClemencyFacets,
  type ClemencyFilterFields,
  type ClemencyGrantDisplayRow,
  fetchClemencyFacets,
  runClemencyFilter,
} from '@/lib/worker-client'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { ExportBar } from '../components/ExportBar'
import { downloadCsv } from '@/lib/export-csv'
import { CLEMENCY_COLUMNS } from '@/lib/export-columns'
import { ClemencyFilterForm } from './ClemencyFilterForm'
import { ClemencyResultsList } from './ClemencyResultsList'
import { ClemencyGrantDetailSheet } from './ClemencyGrantDetailSheet'

/**
 * Clemency surface — the second table of the Presidential Documents corpus,
 * rendered inside the spoke when the "Clemency" section is active (brief
 * #11 §7). Self-contained: facets band + filter + results + recipient
 * detail. Free metadata-floor structured filtering; the cross-table AMA
 * lives in the Documents section's AI mode.
 */
export function ClemencySurface() {
  const auth = useAuth()
  const [facets, setFacets] = useState<ClemencyFacets | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)

  const [rows, setRows] = useState<ClemencyGrantDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [openGrant, setOpenGrant] = useState<ClemencyGrantDisplayRow | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchClemencyFacets()
        if (!cancelled) setFacets(f)
      } catch (e) {
        if (!cancelled) setFacetsError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(fields: ClemencyFilterFields) {
    setLoading(true)
    setError(undefined)
    setHasRun(true)
    try {
      const r = await runClemencyFilter(fields)
      setRows(r.display_rows)
      setCount(r.count)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'clemency',
          mode: 'manual_filter',
          question: fields.search ?? fields.person ?? fields.topic ?? '(structured filter)',
          plan: { fields, executed_sql: r.executed_sql },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenGrant(row: ClemencyGrantDisplayRow) {
    setOpenGrant(row)
    setDetailOpen(true)
  }

  function downloadFilterCsv() {
    if (!rows || rows.length === 0) return
    downloadCsv('ragtime-clemency-results.csv', {
      title: 'RAGtime — clemency export (source: Pardonpedia, CC BY 4.0)',
      meta: [{ key: 'count', value: count }],
      columns: CLEMENCY_COLUMNS,
      rows,
    })
  }

  return (
    <div>
      <ClemencyHoldings facets={facets} error={facetsError} />
      <ClemencyFilterForm
        types={facets?.clemency_types ?? []}
        presidents={facets?.presidents ?? []}
        topics={facets?.topics ?? []}
        loading={loading}
        onSubmit={handleSubmit}
      />
      {rows && rows.length > 0 && !loading && <ExportBar onCsv={downloadFilterCsv} />}
      <ClemencyResultsList
        rows={rows}
        count={count}
        loading={loading}
        error={error}
        hasRun={hasRun}
        onOpenGrant={handleOpenGrant}
      />
      <ClemencyGrantDetailSheet row={openGrant} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}

function ClemencyHoldings({ facets, error }: { facets: ClemencyFacets | undefined; error: string | undefined }) {
  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span><span className="font-mono text-foreground">{facets ? facets.grant_count.toLocaleString() : '…'}</span> grants</span>
        <span><span className="font-mono text-foreground">{facets ? facets.with_warrant_text.toLocaleString() : '…'}</span> with warrant text</span>
        {facets && <span>{facets.earliest} → {facets.latest}</span>}
        <span className="text-muted-foreground/70">Source: Pardonpedia (CC BY 4.0)</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground/80">
        Caveat: Biden&rsquo;s mass commutations are not yet individualized in
        the source (≈264 records vs. ~4,200 reported actions); January 6
        recipient names are Wikipedia-derived (DOJ recorded that pardon as a
        class).
      </p>
      {error && <p className="mt-1 text-xs text-destructive">Could not load clemency holdings: {error}</p>}
    </div>
  )
}
