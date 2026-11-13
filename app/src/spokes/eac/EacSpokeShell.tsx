import { useEffect, useMemo, useRef, useState } from 'react'
import { searchBoxLine } from '@/lib/searched-as'
import { BOX_SEARCH } from '@/lib/box-fallback'
import {
  type BoxFallback,
  type CorpusSpoke,
  type EacDocumentDisplayRow,
  type EacFacets,
  type EacFilterFields,
  type EacFilterResult,
  type SemanticSearchRow,
  fetchEacFacets,
  fetchEacItemsByIds,
  runEacFilter,
  runSemanticSearch,
} from '@lawfare/ragtime-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { useOpenDeepLinkedDocument } from '@/lib/use-deep-link'
import { usePaid } from '@/auth/use-paid'
import { useAuth } from '@/lib/use-auth'
import { BackToHubLink } from '../components/BackToHubLink'
import { SpokeIdentity } from '../components/SpokeIdentity'
import { ExportBar } from '../components/ExportBar'
import {
  ResultsPaneHeader,
  SemanticResultsList,
} from '../components/SemanticResultsList'
import { downloadCsv } from '@/lib/export-csv'
import { EAC_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { useMoreLikeThis, type MltSeed } from '../more-like-this/useMoreLikeThis'
import { MoreLikeThisPrompt } from '../more-like-this/MoreLikeThisPrompt'
import { MoreLikeThisView } from '../more-like-this/MoreLikeThisView'
import { EacFilterForm } from './EacFilterForm'
import { EacDocumentDetailSheet } from './EacDocumentDetailSheet'
import { EacResultsList } from './EacResultsList'

/**
 * EAC spoke shell. One query mode, manual_filter: words / title / author
 * group / file type / folder / shown-as / posted-date, with side-by-side
 * keyword and semantic results (195,207 chunks under corpus 'eac') and a
 * document sheet that holds the display-tier rule (EacDocumentDetailSheet).
 *
 * No ModeRow and no AI modes: plan/execute/summarize are off for EAC in the
 * catalogue, so no model reads EAC text. More-like-this is live; the Worker
 * never reads a link-only seed's text and drops link-only snippets.
 */
export function EacSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()
  const paid = usePaid()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<EacFacets | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchEacFacets()
        if (!cancelled) setFacets(f)
      } catch (e) {
        if (!cancelled) setFacetsError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setFacetsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Filter state.
  const [rows, setRows] = useState<EacDocumentDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [filterIds, setFilterIds] = useState<number[]>([])
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)
  const [searchedAs, setSearchedAs] = useState<string | null>(null)
  const [boxFallback, setBoxFallback] = useState<BoxFallback | undefined>(undefined)

  // Semantic pane state.
  const [semRows, setSemRows] = useState<SemanticSearchRow[] | undefined>(undefined)
  const [semLoading, setSemLoading] = useState(false)
  const [semError, setSemError] = useState<string | undefined>(undefined)
  const [semHasRun, setSemHasRun] = useState(false)
  const [semOpeningId, setSemOpeningId] = useState<string | null>(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [openDocument, setOpenDocument] = useState<EacDocumentDisplayRow | null>(null)

  function handleOpenDocument(row: EacDocumentDisplayRow) {
    setOpenDocument(row)
    setDetailOpen(true)
  }

  // Hub → workspace carryover (`?q=`).
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Explorer document handoff (`/corpus/eac/<id>`, the target of an `rt://`
  // citation): open the document sheet once on mount.
  useOpenDeepLinkedDocument((doc) => handleOpenById(doc.id, setMltOpeningId))

  async function handleSubmit(fields: EacFilterFields) {
    const wantSemantic = spoke.semanticSearch === true && !!fields.search?.trim()
    await Promise.all([
      runKeywordPane(fields),
      wantSemantic
        ? runSemanticPane(fields.search!.trim())
        : Promise.resolve(clearSemanticPane()),
    ])
  }

  async function runKeywordPane(fields: EacFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    setSearchedAs(null)
    setBoxFallback(undefined)
    try {
      const r: EacFilterResult = await runEacFilter(fields, BOX_SEARCH)
      setSearchedAs(searchBoxLine(fields.search, r))
      setBoxFallback(r.fallback)
      setRows(r.display_rows)
      setCount(r.count)
      setFilterIds(r.ids)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'eac',
          mode: 'manual_filter',
          question: fields.search ?? fields.title ?? '(structured filter)',
          plan: { fields, executed_sql: r.executed_sql, search_mode: 'both' },
          cited_ids: r.ids,
        },
        auth.auth,
      )
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setFilterIds([])
      setExecutedSql(undefined)
    } finally {
      setQueryLoading(false)
    }
  }

  function clearSemanticPane() {
    setSemRows(undefined)
    setSemError(undefined)
    setSemHasRun(false)
  }

  async function runSemanticPane(query: string) {
    setSemLoading(true)
    setSemError(undefined)
    setSemHasRun(true)
    try {
      const r = await runSemanticSearch('eac', query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'eac',
          mode: 'semantic_search',
          question: query,
          plan: { search_mode: 'both' },
          cited_ids: r.results.map((row) => row.id),
        },
        auth.auth,
      )
    } catch (e) {
      setSemError(e instanceof Error ? e.message : String(e))
      setSemRows([])
    } finally {
      setSemLoading(false)
    }
  }

  /** Open the sheet for an id from semantic search, more-like-this or a deep
   *  link: the list row comes from /items-by-ids, so the sheet starts from
   *  the same Worker-scrubbed row the filter would have given. */
  async function handleOpenById(id: string, setOpening: (id: string | null) => void) {
    setOpening(id)
    try {
      const found = await fetchEacItemsByIds([Number(id)])
      if (found.length > 0) handleOpenDocument(found[0])
    } catch {
      // Best-effort: the card simply stays closed.
    } finally {
      setOpening(null)
    }
  }

  function handleOpenSemanticResult(row: SemanticSearchRow) {
    return handleOpenById(row.id, setSemOpeningId)
  }

  // ── "More like this" pivot stack ───────────────────────────────────────
  const [mltOpeningId, setMltOpeningId] = useState<string | null>(null)
  const mlt = useMoreLikeThis({
    slug: 'eac',
    auth: auth.auth,
    stashedLabel: 'EAC search',
    onBalance: paid.applyBalanceFromWorker,
    onResult: (page) => {
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: 'eac',
          mode: 'more_like_this',
          question: page.prompt || '(overall similarity)',
          plan: {
            seed_id: page.seed.id,
            route: page.result.route,
            lens: page.result.lens,
            query: page.result.query,
          },
          cited_ids: page.result.results.map((r) => r.id),
          cost_cents: page.result._cost_cents,
        },
        auth.auth,
      )
    },
  })

  function handleMoreLikeThis(seed: MltSeed) {
    setDetailOpen(false)
    mlt.requestPivot(seed)
  }

  const keywordIdSet = useMemo(
    () => new Set(filterIds.map((id) => String(id))),
    [filterIds],
  )
  const semanticIdSet = useMemo(
    () => new Set((semRows ?? []).map((r) => r.id)),
    [semRows],
  )
  const showSemanticPane = spoke.semanticSearch === true && (semHasRun || semLoading)
  const panesSideBySide = showSemanticPane

  function downloadFilterCsv() {
    if (!rows || rows.length === 0) return
    downloadCsv('ragtime-eac-results.csv', {
      title: 'RAGtime — U.S. Election Assistance Commission export',
      meta: [
        { key: 'count', value: count },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: EAC_COLUMNS,
      rows,
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <EacHeader
        spoke={spoke}
        facets={facets}
        loading={facetsLoading}
        error={facetsError}
      />
      {mlt.active ? (
        <MoreLikeThisView
          controller={mlt}
          documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'document'}
          onOpenResult={(id) => handleOpenById(id, setMltOpeningId)}
          openingId={mltOpeningId}
        />
      ) : (
        <>
          <EacFilterForm
            facets={facets}
            loading={queryLoading}
            onSubmit={handleSubmit}
            initialSearch={carryover ?? undefined}
          />
          {rows && rows.length > 0 && !queryLoading && (
            <ExportBar onCsv={downloadFilterCsv} />
          )}
          <div
            className={
              panesSideBySide
                ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border'
                : undefined
            }
          >
            <div className="min-w-0">
              {panesSideBySide && <ResultsPaneHeader kind="keyword" />}
              <EacResultsList
                fallback={{ reply: boxFallback, onOpen: handleOpenSemanticResult }}
                searchedAs={searchedAs}
                rows={rows}
                count={count}
                loading={queryLoading}
                error={queryError}
                hasRun={hasRun}
                executedSql={executedSql}
                onOpenDocument={handleOpenDocument}
                semanticMatchIds={semHasRun ? semanticIdSet : undefined}
              />
            </div>
            {showSemanticPane && (
              <div className="min-w-0">
                {panesSideBySide && <ResultsPaneHeader kind="semantic" />}
                <SemanticResultsList
                  rows={semRows}
                  loading={semLoading}
                  error={semError}
                  hasRun={semHasRun}
                  keywordIds={hasRun ? keywordIdSet : undefined}
                  onOpen={handleOpenSemanticResult}
                  openingId={semOpeningId}
                />
              </div>
            )}
          </div>
        </>
      )}
      <MoreLikeThisPrompt
        seed={mlt.pendingSeed}
        documentUnitLabel={spoke.moreLikeThis?.documentUnit.label ?? 'document'}
        similarityHints={spoke.moreLikeThis?.similarityHints ?? []}
        loading={mlt.loading}
        onSubmit={mlt.submitPivot}
        onCancel={mlt.cancelPivot}
      />
      <EacDocumentDetailSheet
        row={openDocument}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMoreLikeThis={handleMoreLikeThis}
      />
    </div>
  )
}

/** Header band: identity, the plain-English note, and four holdings tiles. */
function EacHeader({
  spoke,
  facets,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  facets: EacFacets | undefined
  loading: boolean
  error: string | undefined
}) {
  // The date range would go here, but /corpus/eac/facets drops earliest/latest
  // today (the Worker's tier scrub removes strings from id-less rows), so the
  // tile shows the snapshot date instead, which is always true.
  return (
    <section className="border-b border-border bg-card px-6 py-5">
      <SpokeIdentity spoke={spoke} />
      <BackToHubLink className="mb-3" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        {spoke.plainEnglishDisclosure}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HoldingTile label="Documents" value={facets?.document_count} loading={loading} />
        <HoldingTile label="Shown in full" value={facets?.shown_in_full} loading={loading} />
        <HoldingTile label="Link only" value={facets?.link_only} loading={loading} />
        <HoldingTile label="eac.gov snapshot" stringValue="2026-10-13" loading={false} />
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">Could not load holdings: {error}</p>
      )}
    </section>
  )
}

function HoldingTile({
  label,
  value,
  stringValue,
  loading,
}: {
  label: string
  value?: number | string
  stringValue?: string
  loading: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-medium tabular-nums text-foreground">
        {loading
          ? '…'
          : stringValue
            ? stringValue
            : value != null
              ? Number(value).toLocaleString()
              : '—'}
      </p>
    </div>
  )
}
