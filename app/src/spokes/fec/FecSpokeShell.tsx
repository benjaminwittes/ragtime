import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CorpusSpoke,
  type FecFacets,
  type FecFilterFields,
  type FecFilterResult,
  type FecKind,
  fetchFecFacets,
  fetchFecItemsByIds,
  runFecFilter,
} from '@lawfare/ragtime-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { useOpenDeepLinkedDocument } from '@/lib/use-deep-link'
import { useAuth } from '@/lib/use-auth'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { BackToHubLink } from '../components/BackToHubLink'
import { SpokeIdentity } from '../components/SpokeIdentity'
import { FEC_CYCLE_NOTE, FEC_SLUG, fieldsForKind, idCountLabel } from './fec-format'
import { type FecOpenTarget } from './FecFigures'
import { FecFilterForm } from './FecFilterForm'
import { FecResultsList } from './FecResultsList'
import { FecDetailSheet } from './FecDetailSheet'

/**
 * FEC spoke shell. One query mode, manual_filter: a kind toggle (candidate
 * IDs / committee IDs), a name-or-ID search, cycle or cycle range and the
 * contract's filters, with facet counts; one result row per ID; and a sheet
 * per candidate ID or committee ID whose linked IDs open the other sheet.
 *
 * No AI modes, no semantic search and no more-like-this: the FEC corpus is
 * structured summary tables, not text. Built ahead of the Worker routes and
 * of the corpus going live (see index.ts).
 */
export function FecSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [kind, setKind] = useState<FecKind>('candidate')

  // Header totals: unfiltered facets for each kind, once.
  const [totals, setTotals] = useState<{ candidate?: number; committee?: number }>({})
  const [totalsLoading, setTotalsLoading] = useState(true)
  const [totalsError, setTotalsError] = useState<string | undefined>(undefined)

  // Facets for the form: the current kind under the last-run filters.
  const [facets, setFacets] = useState<FecFacets | undefined>(undefined)
  const facetsSeq = useRef(0)

  const [result, setResult] = useState<FecFilterResult | undefined>(undefined)
  const [lastFields, setLastFields] = useState<FecFilterFields | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)

  const [target, setTarget] = useState<FecOpenTarget | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [c, m] = await Promise.all([
          fetchFecFacets({ kind: 'candidate' }),
          fetchFecFacets({ kind: 'committee' }),
        ])
        if (cancelled) return
        setTotals({ candidate: c.total, committee: m.total })
        setFacets((prev) => prev ?? c)
      } catch (e) {
        if (!cancelled) setTotalsError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setTotalsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function loadFacets(fields: Omit<FecFilterFields, 'limit' | 'offset'>) {
    const seq = ++facetsSeq.current
    void fetchFecFacets(fieldsForKind(fields))
      .then((f) => {
        if (seq === facetsSeq.current) setFacets(f)
      })
      .catch(() => {
        // Facet counts are a help, not the answer: the form keeps working without them.
      })
  }

  function handleKindChange(next: FecKind) {
    if (next === kind) return
    setKind(next)
    setResult(undefined)
    setHasRun(false)
    setQueryError(undefined)
    setLastFields(undefined)
    setFacets(undefined)
    loadFacets({ kind: next })
  }

  function handleOpen(t: FecOpenTarget) {
    setTarget(t)
    setDetailOpen(true)
  }

  async function runQuery(fields: FecFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    setLastFields(fields)
    try {
      const r = await runFecFilter(fieldsForKind(fields))
      setResult(r)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: FEC_SLUG,
          mode: 'manual_filter',
          question: fields.search ?? '(structured filter)',
          plan: { fields },
          cited_ids: r.results.map((row) => `${r.kind}:${row.id}`),
        },
        auth.auth,
      )
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setResult(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  function handleSubmit(raw: FecFilterFields) {
    const fields = fieldsForKind(raw)
    const { limit: _l, offset: _o, ...facetFields } = fields
    void _l
    void _o
    loadFacets(facetFields)
    void runQuery(fields)
  }

  function handlePage(offset: number) {
    if (!lastFields) return
    void runQuery({ ...lastFields, offset })
  }

  // Hub → workspace carryover (`?q=`): search candidate IDs by name.
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    handleSubmit({ kind: 'candidate', search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep link (`/corpus/fec/candidate:<id>` or `committee:<id>`, the ids the
  // hub keyword builder returns): open that sheet once on mount.
  useOpenDeepLinkedDocument(async (doc) => {
    const parsed = parseFecId(doc.id)
    if (!parsed) return
    const found = await fetchFecItemsByIds([`${parsed.kind}:${parsed.id}`])
    if (found.length > 0) handleOpen(parsed)
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-card px-6 py-5">
        <SpokeIdentity spoke={spoke} />
        <BackToHubLink className="mb-3" />
        <p className="max-w-3xl text-sm text-muted-foreground">{spoke.plainEnglishDisclosure}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <HoldingTile
            label="Candidate IDs"
            value={totalsLoading ? '…' : totals.candidate != null ? idCountLabel(totals.candidate, 'candidate') : '—'}
          />
          <HoldingTile
            label="Committee IDs"
            value={totalsLoading ? '…' : totals.committee != null ? idCountLabel(totals.committee, 'committee') : '—'}
          />
          <HoldingTile label="Source" value="FEC bulk summary files" />
        </div>
        <p className="mt-3 max-w-3xl text-[11px] text-muted-foreground/80">{FEC_CYCLE_NOTE}</p>
        {totalsError && (
          <p className="mt-2 text-xs text-destructive">Could not load holdings: {totalsError}</p>
        )}
      </section>
      <FecFilterForm
        key={kind}
        kind={kind}
        onKindChange={handleKindChange}
        facets={facets}
        loading={queryLoading}
        onSubmit={handleSubmit}
        initialSearch={kind === 'candidate' ? (carryover ?? undefined) : undefined}
      />
      <FecResultsList
        result={result}
        loading={queryLoading}
        error={queryError}
        hasRun={hasRun}
        onOpen={handleOpen}
        onPage={handlePage}
      />
      <FecDetailSheet
        target={target}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onOpen={handleOpen}
      />
    </div>
  )
}

/** "candidate:S0GA00559" / "committee:C00123456" → its kind and ID. */
function parseFecId(raw: string): FecOpenTarget | null {
  const m = String(raw).match(/^(candidate|committee):(.+)$/)
  return m ? { kind: m[1] as FecOpenTarget['kind'], id: m[2] } : null
}

function HoldingTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium tabular-nums text-foreground">{value}</p>
    </div>
  )
}
