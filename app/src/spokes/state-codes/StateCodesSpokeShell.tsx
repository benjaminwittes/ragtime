import { useEffect, useMemo, useRef, useState } from 'react'
import { searchBoxLine } from '@/lib/searched-as'
import { BOX_SEARCH } from '@/lib/box-fallback'
import {
  type BoxFallback,
  type CorpusSpoke,
  type SemanticSearchRow,
  type StateCodeSectionDisplayRow,
  type StateCodesFacets,
  type StateCodesFilterFields,
  type StateCodesFilterResult,
  type StateCodesMember,
  fetchStateCodesFacets,
  runSemanticSearch,
  runStateCodesFilter,
} from '@lawfare/ragtime-client'
import { useDocs } from '@/docs/DocsContext'
import { readCarryoverQuery } from '@/lib/routing'
import { useOpenDeepLinkedDocument } from '@/lib/use-deep-link'
import { qualifiedId } from '@/lib/deep-link'
import { useAuth } from '@/lib/use-auth'
import { BackToHubLink } from '../components/BackToHubLink'
import { SpokeIdentity } from '../components/SpokeIdentity'
import { ExportBar } from '../components/ExportBar'
import { ResultsPaneHeader } from '../components/SemanticResultsList'
import { downloadCsv } from '@/lib/export-csv'
import { STATE_CODES_COLUMNS } from '@/lib/export-columns'
import { newInteractionId, postUsageLog } from '@/lib/usage-log'
import { StateCodesFilterForm } from './StateCodesFilterForm'
import { StateCodesResultsList } from './StateCodesResultsList'
import { StateCodesSemanticResults } from './StateCodesSemanticResults'
import {
  StateCodeSectionDetailSheet,
  type StateCodeSectionTarget,
} from './StateCodeSectionDetailSheet'
import {
  MEMBER_FALLBACK,
  STATE_CODES_SLUG,
  parseSectionKey,
  sectionRowKey,
  semanticRowToSection,
  semanticSlugFor,
} from './state-codes-format'

/**
 * State Codes spoke shell. One query mode, manual_filter: jurisdiction
 * (member) / section / words / heading / title / chapter / status / hide
 * not-in-force / temporary text only, with side-by-side keyword and meaning
 * results and a section sheet.
 *
 * Member-aware the way commentary is: every call names its member, and rows
 * are keyed by { member, id } because two members' ids collide. The District
 * is the only member, so the jurisdiction picker has one entry for now.
 *
 * The not-in-force rule: rows that are not in force are badged in both panes
 * and the fallback; the "hide not in force" toggle is off until the reader
 * turns it on (from the form, or from the results line that offers it), and
 * when it is on the results say how many sections it hid and which statuses.
 *
 * No ModeRow and no AI modes, no more-like-this, no save buttons: none is
 * declared for this corpus yet. Built against the PROPOSED state_codes routes
 * (packages/client worker-client.ts, "/corpus/state_codes/*").
 */
export function StateCodesSpokeShell({ spoke }: { spoke: CorpusSpoke }) {
  const { setActiveSpokeSlug } = useDocs()
  const auth = useAuth()

  useEffect(() => {
    setActiveSpokeSlug(spoke.slug)
    return () => setActiveSpokeSlug(undefined)
  }, [spoke.slug, setActiveSpokeSlug])

  const [facets, setFacets] = useState<StateCodesFacets | undefined>(undefined)
  const [facetsError, setFacetsError] = useState<string | undefined>(undefined)
  const [facetsLoading, setFacetsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const f = await fetchStateCodesFacets()
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

  const [member, setMember] = useState<StateCodesMember>('dc')
  const [inForceOnly, setInForceOnly] = useState(false)

  // Filter state.
  const [rows, setRows] = useState<StateCodeSectionDisplayRow[] | undefined>(undefined)
  const [count, setCount] = useState<number | undefined>(undefined)
  const [statusCounts, setStatusCounts] = useState<Partial<Record<string, number>> | undefined>(undefined)
  const [ranInForceOnly, setRanInForceOnly] = useState(false)
  const [executedSql, setExecutedSql] = useState<string | undefined>(undefined)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | undefined>(undefined)
  const [hasRun, setHasRun] = useState(false)
  const [searchedAs, setSearchedAs] = useState<string | null>(null)
  const [boxFallback, setBoxFallback] = useState<BoxFallback | undefined>(undefined)
  const lastFieldsRef = useRef<StateCodesFilterFields | null>(null)

  // Semantic pane state.
  const [semRows, setSemRows] = useState<SemanticSearchRow[] | undefined>(undefined)
  const [semLoading, setSemLoading] = useState(false)
  const [semError, setSemError] = useState<string | undefined>(undefined)
  const [semHasRun, setSemHasRun] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [target, setTarget] = useState<StateCodeSectionTarget | null>(null)

  function openTarget(t: StateCodeSectionTarget) {
    setTarget(t)
    setDetailOpen(true)
  }

  function handleOpenSection(row: StateCodeSectionDisplayRow) {
    openTarget({ ref: { member: row.member, id: row.id }, row })
  }

  function handleOpenSemanticResult(row: SemanticSearchRow) {
    const section = semanticRowToSection(row, member)
    if (section) handleOpenSection(section)
  }

  // Hub → workspace carryover (`?q=`).
  const carryover = useMemo(() => readCarryoverQuery(), [])
  const carriedOverRef = useRef(false)
  useEffect(() => {
    if (carriedOverRef.current || !carryover) return
    carriedOverRef.current = true
    void handleSubmit({ member, search: carryover })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Explorer document handoff (`/corpus/state_codes:dc/<id>` or
  // `/corpus/state_codes/dc:<id>`): open the section sheet once on mount.
  useOpenDeepLinkedDocument((doc) => {
    const key = parseSectionKey(qualifiedId(doc), member)
    if (key) openTarget({ ref: key })
  })

  async function handleSubmit(fields: StateCodesFilterFields) {
    lastFieldsRef.current = fields
    const wantSemantic = spoke.semanticSearch === true && !!fields.search?.trim()
    await Promise.all([
      runKeywordPane(fields),
      wantSemantic
        ? runSemanticPane(fields.member ?? member, fields.search!.trim())
        : Promise.resolve(clearSemanticPane()),
    ])
  }

  /** The results line's "Hide them" / "Show them": the same search again,
   *  with the toggle flipped (the form's checkbox follows). */
  function handleSetInForceOnly(next: boolean) {
    setInForceOnly(next)
    const last = lastFieldsRef.current
    if (!last) return
    const fields: StateCodesFilterFields = { ...last, inForceOnly: next || undefined }
    if (next) delete fields.status
    void runKeywordPane(fields)
    lastFieldsRef.current = fields
  }

  async function runKeywordPane(fields: StateCodesFilterFields) {
    setQueryLoading(true)
    setQueryError(undefined)
    setHasRun(true)
    setSearchedAs(null)
    setBoxFallback(undefined)
    try {
      const r: StateCodesFilterResult = await runStateCodesFilter(fields, BOX_SEARCH)
      setSearchedAs(searchBoxLine(fields.search, r))
      setBoxFallback(r.fallback)
      setRows(r.display_rows)
      setCount(r.count)
      setStatusCounts(r.status_counts)
      setRanInForceOnly(fields.inForceOnly === true)
      setExecutedSql(r.executed_sql)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: STATE_CODES_SLUG,
          mode: 'manual_filter',
          question: fields.search ?? fields.citation ?? fields.heading ?? '(structured filter)',
          plan: { fields, executed_sql: r.executed_sql, search_mode: 'both' },
          cited_ids: r.display_rows.map(sectionRowKey),
        },
        auth.auth,
      )
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e))
      setRows([])
      setCount(0)
      setStatusCounts(undefined)
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

  async function runSemanticPane(m: StateCodesMember, query: string) {
    setSemLoading(true)
    setSemError(undefined)
    setSemHasRun(true)
    try {
      const r = await runSemanticSearch(semanticSlugFor(m), query, { mode: 'semantic' })
      setSemRows(r.results)
      void postUsageLog(
        {
          interaction_id: newInteractionId(),
          surface: STATE_CODES_SLUG,
          mode: 'semantic_search',
          question: query,
          plan: { search_mode: 'both', member: m },
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

  // Overlap badging: both panes speak member-qualified keys ('dc:123').
  const keywordKeySet = useMemo(
    () => new Set((rows ?? []).map(sectionRowKey)),
    [rows],
  )
  const semanticKeySet = useMemo(
    () =>
      new Set(
        (semRows ?? [])
          .map((r) => parseSectionKey(r.id, member))
          .filter((k): k is { member: string; id: number } => k !== null)
          .map(sectionRowKey),
      ),
    [semRows, member],
  )
  const showSemanticPane = spoke.semanticSearch === true && (semHasRun || semLoading)

  function downloadFilterCsv() {
    if (!rows || rows.length === 0) return
    downloadCsv('ragtime-state-codes-results.csv', {
      title: 'RAGtime — State Codes export',
      meta: [
        { key: 'jurisdiction', value: member },
        { key: 'count', value: count },
        { key: 'not_in_force_hidden', value: ranInForceOnly ? 'yes' : 'no' },
        { key: 'executed_sql', value: executedSql },
      ],
      columns: STATE_CODES_COLUMNS,
      rows,
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StateCodesHeader
        spoke={spoke}
        member={member}
        facets={facets}
        loading={facetsLoading}
        error={facetsError}
      />
      <StateCodesFilterForm
        facets={facets}
        member={member}
        onMemberChange={setMember}
        inForceOnly={inForceOnly}
        onInForceOnlyChange={setInForceOnly}
        loading={queryLoading}
        onSubmit={handleSubmit}
        initialSearch={carryover ?? undefined}
      />
      {rows && rows.length > 0 && !queryLoading && (
        <ExportBar onCsv={downloadFilterCsv} />
      )}
      <div
        className={
          showSemanticPane
            ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-border'
            : undefined
        }
      >
        <div className="min-w-0">
          {showSemanticPane && <ResultsPaneHeader kind="keyword" />}
          <StateCodesResultsList
            member={member}
            fallback={{ reply: boxFallback, onOpen: handleOpenSemanticResult }}
            searchedAs={searchedAs}
            rows={rows}
            count={count}
            loading={queryLoading}
            error={queryError}
            hasRun={hasRun}
            executedSql={executedSql}
            statusCounts={statusCounts}
            inForceOnly={ranInForceOnly}
            onSetInForceOnly={handleSetInForceOnly}
            onOpenSection={handleOpenSection}
            semanticMatchIds={semHasRun ? semanticKeySet : undefined}
          />
        </div>
        {showSemanticPane && (
          <div className="min-w-0">
            <ResultsPaneHeader kind="semantic" />
            <StateCodesSemanticResults
              rows={semRows}
              member={member}
              loading={semLoading}
              error={semError}
              hasRun={semHasRun}
              keywordIds={hasRun ? keywordKeySet : undefined}
              onOpenSection={handleOpenSection}
            />
          </div>
        )}
      </div>
      <StateCodeSectionDetailSheet
        target={target}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onOpenSection={openTarget}
      />
    </div>
  )
}

/** Header band: identity, the plain-English note, and the member's holdings. */
function StateCodesHeader({
  spoke,
  member,
  facets,
  loading,
  error,
}: {
  spoke: CorpusSpoke
  member: StateCodesMember
  facets: StateCodesFacets | undefined
  loading: boolean
  error: string | undefined
}) {
  const m = facets?.members[member]
  const notInForce = m ? m.section_count - m.in_force_count : undefined
  return (
    <section className="border-b border-border bg-card px-6 py-5">
      <SpokeIdentity spoke={spoke} />
      <BackToHubLink className="mb-3" />
      <p className="max-w-3xl text-sm text-muted-foreground">
        {spoke.plainEnglishDisclosure}
      </p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-foreground">
        {m?.label ?? MEMBER_FALLBACK[member].label}
        <span className="ml-2 font-normal normal-case text-muted-foreground">
          {m?.code_name ?? MEMBER_FALLBACK[member].codeName}
        </span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <HoldingTile label="Sections" value={m?.section_count} loading={loading} />
        <HoldingTile label="In force" value={m?.in_force_count} loading={loading} />
        <HoldingTile label="Not in force" value={notInForce} loading={loading} />
        <HoldingTile label="Temporary text" value={m?.temporary_text_count} loading={loading} />
        <HoldingTile label="Law reflected through" stringValue={m?.codified_date ?? undefined} loading={loading} />
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
  value?: number
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
