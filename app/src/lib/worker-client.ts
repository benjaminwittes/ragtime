/**
 * Worker client — typed wrappers for the Cloudflare Worker's /corpus/* endpoints.
 *
 * The Worker (ragtimeproxy) is the corpus query path's server-side surface;
 * /corpus/* endpoints query the corpus Supabase project. The free-tier read
 * endpoints are public + IP rate-limited; AI endpoints take the user's BYOK
 * (or, eventually, a Lawfare session JWT) in the request body.
 *
 * v1 wired endpoints:
 *  - POST /corpus/facets — corpus counts + court / judge / collection lists
 *  - POST /corpus/filter — manual filter execution against the cases table
 *  - POST /corpus/sql    — AI writes SQL from a natural-language prompt
 *  - POST /corpus/entries — docket entries for one case (case-detail panel)
 *
 * WORKER URL: VITE_WORKER_URL env var, with the production URL as the
 * fallback. Override in `app/.env.local` for dev work against a local
 * `wrangler dev` instance.
 */

import type { ByokConfig } from '@/llm/byok-context'

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ||
  'https://ragtimeproxy.benjamin-wittes.workers.dev'

/* ----------------------------------------------------------------------------
 * /corpus/facets
 * ------------------------------------------------------------------------- */

export type CollectionRef = {
  slug: string
  name: string
}

export type CorpusFacets = {
  case_count: number
  entry_count: number
  court_count: number
  /** YYYY-MM-DD; the Worker derives it from MAX(last_synced_at). */
  last_synced: string
  /** All distinct court codes in the corpus (used for the courts checkbox list). */
  courts: string[]
  /** All distinct judge names in the corpus (used for the judge dropdown). */
  judges: string[]
  collections: CollectionRef[]
}

export async function fetchCorpusFacets(): Promise<CorpusFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CorpusFacets
}

/* ----------------------------------------------------------------------------
 * /corpus/filter
 * ------------------------------------------------------------------------- */

/**
 * Filter fields the Worker accepts. Mirrors `buildFilterWhere` in
 * worker/index.js (filter contract derived from there). Empty / undefined
 * fields are dropped.
 */
export type FilterFields = {
  /** Full-text search over docket_entries.fts (websearch_to_tsquery). */
  search?: string
  /** ILIKE-substring match on cases.case_name. */
  name?: string
  /** Selected court codes. Ignored if allCourts is true. */
  courts?: string[]
  /** Shortcut: include all courts (skips the courts predicate entirely). */
  allCourts?: boolean
  /** Exact match on cases.judge. */
  judge?: string
  /** One of cv / cr / mj / mc (civil / criminal / magistrate / misc). */
  caseType?: 'cv' | 'cr' | 'mj' | 'mc'
  /** Collection slug; joined via collection_cases. */
  collection?: string
  /** ILIKE on cause or nature_of_suit (either match counts). */
  cause?: string
  /** ISO YYYY-MM-DD lower bound on date_filed. */
  from?: string
  /** ISO YYYY-MM-DD upper bound on date_filed. */
  to?: string
}

/** Scope object for stacking filter on top of a prior page's id-set. v1 we
 *  send an empty scope — the stack runtime that uses scope.cl_ids /
 *  scope.scope_sql lands in a later PR. */
export type FilterScope = Record<string, unknown>

/** One row in `display_rows` — mirrors the Worker's SQL_DISPLAY_COLS. */
export type CaseDisplayRow = {
  cl_id: number
  docket_number: string | null
  case_name: string | null
  date_filed: string | null
  date_terminated: string | null
  judge: string | null
  cause: string | null
  nature_of_suit: string | null
  plaintiff: string | null
  defendant: string | null
  entry_count: number | null
  cl_url: string | null
  court: string | null
}

export type FilterResult = {
  cl_ids: number[]
  display_rows: CaseDisplayRow[]
  count: number
  /** The SQL the Worker generated for the display query — surfaced for the
   *  auditability principle (brief #6 governing principles, §7b item 3). */
  generated_sql: string
  /** The id-set query — separate so the user can see the cheap path too. */
  executed_sql: string
}

export async function runManualFilter(
  fields: FilterFields,
  scope?: FilterScope,
): Promise<FilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields, scope: scope ?? {} }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FilterResult
}

/* ----------------------------------------------------------------------------
 * /corpus/sql — AI-writes-SQL ("claude_sql" mode)
 * ------------------------------------------------------------------------- */

export type SqlGenRequest = {
  /** Natural-language description of the filter the user wants. */
  prompt: string
  /** Same stacking scope shape as /corpus/filter. v1 we send an empty
   *  scope; the stack runtime (PR 4g) populates this with the prior page's
   *  cl_ids / scope_sql. */
  scope?: FilterScope
}

/**
 * /corpus/sql success response. The id-set + display_rows shape mirrors
 * /corpus/filter so the results list renderer doesn't care which mode
 * produced the page. Extra fields: the model-generated SQL and the model's
 * short `label` for the operation (used in breadcrumbs once the stack
 * runtime exists).
 *
 * `_cost_cents` and `_balance_cents` are only populated for the Lawfare-
 * paid auth path; BYOK calls leave them undefined/0.
 */
export type SqlGenResult = {
  generated_sql: string
  label: string
  cl_ids: number[]
  count: number
  display_rows: CaseDisplayRow[]
  _cost_cents?: number
  _balance_cents?: number
}

/**
 * /corpus/sql error envelope. The Worker surfaces `generated_sql` on
 * `query_failed` so the user can see what the model produced even when it
 * didn't execute.
 */
export type SqlGenError = {
  message: string
  code?: 'too_many_rows' | 'query_failed' | string
  /** Present on query_failed — the SQL that the model produced but couldn't
   *  be executed against the corpus. */
  generated_sql?: string
}

export class WorkerSqlError extends Error {
  code?: string
  generatedSql?: string
  status: number
  constructor(err: SqlGenError, status: number) {
    super(err.message)
    this.name = 'WorkerSqlError'
    this.code = err.code
    this.generatedSql = err.generated_sql
    this.status = status
  }
}

export async function runClaudeSql(
  req: SqlGenRequest,
  byok: ByokConfig,
): Promise<SqlGenResult> {
  const r = await fetch(`${WORKER_URL}/corpus/sql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: byok.provider,
      model: byok.model,
      prompt: req.prompt,
      scope: req.scope ?? {},
      user_api_key: byok.apiKey,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: SqlGenError
    }
    const err = body.error ?? {
      message: `Request failed (${r.status} ${r.statusText})`,
    }
    throw new WorkerSqlError(err, r.status)
  }
  return (await r.json()) as SqlGenResult
}

/* ----------------------------------------------------------------------------
 * /corpus/entries — case detail
 * ------------------------------------------------------------------------- */

/** One docket entry row, shaped by the Worker's SELECT in corpusEntriesHandler. */
export type DocketEntryRow = {
  entry_number: number | null
  entry_date: string | null
  description: string | null
}

export type CaseEntriesResult = {
  entries: DocketEntryRow[]
}

export async function fetchCaseEntries(clId: number): Promise<CaseEntriesResult> {
  const r = await fetch(`${WORKER_URL}/corpus/entries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cl_id: clId }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/entries failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CaseEntriesResult
}

/* ----------------------------------------------------------------------------
 * Docket-entry rendering helpers (ported from index.html)
 * ------------------------------------------------------------------------- */

/**
 * Strip bracketed 6-10 digit PACER internal document IDs (they don't map to
 * public URLs) and normalize whitespace. Mirrors `renderDescription` in
 * index.html. Returns the cleaned plain text; callers wrap in their own
 * element + handle escaping (React handles that automatically).
 */
export function cleanEntryDescription(desc: string | null | undefined): string {
  if (!desc) return ''
  return String(desc)
    .replace(/\s*\[\d{6,10}\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a CourtListener deep-link to a specific docket entry. Mirrors
 * `entryLink` in index.html.
 *
 * The pattern `/<docket-id>/<entry-num>/<docket-slug>/` works for districts
 * with small entry numbers; circuits and very large entry numbers fall back
 * to the docket URL with an `#entry-N` anchor.
 */
export function entryDeepLink(
  clUrl: string | null | undefined,
  entryNum: number | null | undefined,
  court: string | null | undefined,
): string {
  if (!clUrl) return '#'
  const courtIsCircuit = court ? /^(ca\d+|cadc|cafc)$/.test(court) : false
  const isLargeEntryNum =
    entryNum != null && /^\d{6,}$/.test(String(entryNum))
  const m = clUrl.match(
    /^(https:\/\/www\.courtlistener\.com\/docket\/\d+)\/([^/?#]+)\/?$/,
  )
  if (m && !courtIsCircuit && !isLargeEntryNum && entryNum != null) {
    return `${m[1]}/${entryNum}/${m[2]}/`
  }
  return clUrl.replace(/\/?$/, '/') + `#entry-${entryNum ?? ''}`
}

/* ----------------------------------------------------------------------------
 * Court taxonomy helpers
 * ------------------------------------------------------------------------- */

/**
 * A court code is "circuit" if it matches the federal-circuit naming pattern
 * (ca1..ca11, cadc, cafc). Everything else is treated as a district court.
 * Mirrors `isCircuit` in the legacy index.html.
 */
export function isCircuitCourt(code: string): boolean {
  return /^(ca\d+|cadc|cafc)$/.test(code)
}

export type CourtPreset = 'all' | 'district' | 'circuit' | 'none'

/** Resolve a court preset to a set of selected court codes against the
 *  corpus's full court list. */
export function resolveCourtPreset(
  preset: CourtPreset,
  allCourts: readonly string[],
): string[] {
  if (preset === 'all') return [...allCourts]
  if (preset === 'none') return []
  if (preset === 'district') return allCourts.filter((c) => !isCircuitCourt(c))
  if (preset === 'circuit') return allCourts.filter((c) => isCircuitCourt(c))
  return []
}

/** Detect which preset (if any) a current selection matches. Returns null
 *  for custom selections. */
export function detectCourtPreset(
  selected: readonly string[],
  allCourts: readonly string[],
): CourtPreset | null {
  if (selected.length === allCourts.length) return 'all'
  if (selected.length === 0) return 'none'
  const district = allCourts.filter((c) => !isCircuitCourt(c))
  const circuit = allCourts.filter((c) => isCircuitCourt(c))
  if (
    selected.length === district.length &&
    selected.every((c) => !isCircuitCourt(c))
  ) {
    return 'district'
  }
  if (
    selected.length === circuit.length &&
    selected.every((c) => isCircuitCourt(c))
  ) {
    return 'circuit'
  }
  return null
}

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

async function safeErrorMessage(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { error?: { message?: string } }
    return body.error?.message ?? r.statusText
  } catch {
    return r.statusText
  }
}
