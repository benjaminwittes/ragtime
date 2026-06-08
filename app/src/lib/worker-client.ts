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

import {
  type AuthArg,
  authBody,
  authCredentialBody,
  authHeaders,
} from '@/lib/auth-arg'
import type { CorpusSlug } from '@/spokes/types'

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ||
  'https://ragtimeproxy.benjamin-wittes.workers.dev'

/* ----------------------------------------------------------------------------
 * /corpus/hub/keyword (PR 4u) — free cross-corpus keyword search
 *
 * Brief #1's headline free surface. Five parallel FTS queries (one per
 * corpus) returning a top-K display set + total count per corpus. No
 * auth; IP-rate-limited.
 *
 * Per-corpus failures don't fail the whole request — the corpus's slot
 * carries an `error` string and other corpora's results still render.
 * ------------------------------------------------------------------------- */

export type HubCorpusSlug = CorpusSlug

export type HubKeywordResultItem = {
  /** Corpus-native primary key, serialized as text so JS doesn't lose
   *  precision on bigint litigation cl_ids. The detail-sheet open path
   *  parses it back to a number. */
  id: string
  /** Display title — citation for USC/CFR, document title for OLC/FRUS,
   *  case name for litigation. Falls back to "(no title)" server-side. */
  title: string
  /** Secondary line — court code for litigation, source for OLC,
   *  place_name for FRUS, title_name for USC/CFR. Null when absent. */
  context: string | null
  /** YYYY-MM-DD where applicable. Null for USC (release-point only). */
  date: string | null
}

export type HubKeywordCorpusBlock = {
  /** Total matching items across the corpus. May exceed results.length. */
  count: number
  /** Top-K display rows (K = 5 server-side). */
  results: HubKeywordResultItem[]
  /** Set when this corpus's query failed — other corpora still rendered. */
  error?: string
}

export type HubKeywordResponse = {
  query: string
  per_corpus: Partial<Record<HubCorpusSlug, HubKeywordCorpusBlock>>
}

export async function runHubKeyword(
  query: string,
  corpora?: readonly HubCorpusSlug[],
): Promise<HubKeywordResponse> {
  const r = await fetch(`${WORKER_URL}/corpus/hub/keyword`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      ...(corpora && corpora.length > 0 ? { corpora } : {}),
    }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/hub/keyword failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as HubKeywordResponse
}

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

/**
 * The Worker's "this query looks expensive" response (HTTP 200, not an error).
 * The model already produced (and charged for) the SQL; the user is offered a
 * "run anyway" path that executes at the 90s ceiling. `reason` distinguishes a
 * proactive guard hit (`estimated_heavy`, carries `estimate`) from a runtime
 * 60s timeout (`timed_out`). Confirm by calling confirmClaudeSql(token).
 */
export type SqlGenConfirmNeeded = {
  needs_confirmation: true
  reason: 'estimated_heavy' | 'timed_out' | string
  token: string
  generated_sql: string
  label: string
  estimate?: { cost: number }
  _cost_cents?: number
  _balance_cents?: number
}

export function isSqlConfirmNeeded(
  r: SqlGenResult | SqlGenConfirmNeeded,
): r is SqlGenConfirmNeeded {
  return (r as SqlGenConfirmNeeded).needs_confirmation === true
}

export async function runClaudeSql(
  req: SqlGenRequest,
  auth: AuthArg,
): Promise<SqlGenResult | SqlGenConfirmNeeded> {
  const r = await fetch(`${WORKER_URL}/corpus/sql`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      prompt: req.prompt,
      scope: req.scope ?? {},
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
  return (await r.json()) as SqlGenResult | SqlGenConfirmNeeded
}

/**
 * "Run anyway" confirmation for a query the guard flagged heavy. Re-posts the
 * stored token; the Worker runs it at the 90s ceiling under the heavy-query cap
 * (no LLM call, so no further charge). A `heavy_busy` (503) means the system is
 * saturated with large searches — surfaced as a normal WorkerSqlError.
 */
export async function confirmClaudeSql(
  token: string,
  auth: AuthArg,
): Promise<SqlGenResult> {
  const r = await fetch(`${WORKER_URL}/corpus/sql`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({ ...authBody(auth), confirm_token: token }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: SqlGenError }
    const err = body.error ?? {
      message: `Request failed (${r.status} ${r.statusText})`,
    }
    throw new WorkerSqlError(err, r.status)
  }
  return (await r.json()) as SqlGenResult
}

/* ----------------------------------------------------------------------------
 * /corpus/analyze — one-shot analytical narrative ("claude_analysis" mode)
 * ------------------------------------------------------------------------- */

/** Server-side hard cap on cases per /corpus/analyze (the context won't fit
 *  beyond this). Mirrors CLAUDE_ANALYSIS_HARD_CAP in worker/index.js. */
export const ANALYSIS_HARD_CAP = 2000

/** Per-case annotations the model may emit alongside the narrative. All
 *  fields are optional — the model includes only what fits the prompt
 *  (e.g., "rank by severity" produces `rank`; "describe patterns" may
 *  produce nothing). */
export type AnalysisAnnotation = {
  rank?: number
  score?: number
  category?: string
  label?: string
}

export type AnalysisResult = {
  /** Narrative markdown. Case references use the `[Case Name](#case-<cl_id>)`
   *  syntax so the result page can wire intra-page anchors. */
  markdown: string
  /** Per-case annotations, keyed by cl_id. The model may omit annotations
   *  for descriptive prompts that don't ask for ranking/categorizing. */
  annotations: Record<number, AnalysisAnnotation>
  /** Display rows the Worker fetched for the analysis context. The shell
   *  uses these to render the case list beneath the narrative (cases are
   *  NOT narrowed by analyze — every input case appears in the result). */
  cases: CaseDisplayRow[]
  _cost_cents?: number
  _balance_cents?: number
}

export class WorkerAnalysisError extends Error {
  code?: string
  status: number
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'WorkerAnalysisError'
    this.status = status
    this.code = code
  }
}

export async function runClaudeAnalysis(
  prompt: string,
  clIds: readonly number[],
  auth: AuthArg,
): Promise<AnalysisResult> {
  const r = await fetch(`${WORKER_URL}/corpus/analyze`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      prompt,
      cl_ids: clIds,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAnalysisError(
      body.error?.message ?? `Request failed (${r.status})`,
      r.status,
      body.error?.code,
    )
  }
  const raw = (await r.json()) as {
    markdown: string
    annotations?: Record<string, AnalysisAnnotation>
    cases: CaseDisplayRow[]
    _cost_cents?: number
    _balance_cents?: number
  }
  // The Worker emits annotations keyed by cl_id as a string-keyed object
  // (JSON convention). Normalize to number keys for ergonomic lookup.
  const annotations: Record<number, AnalysisAnnotation> = {}
  for (const [k, v] of Object.entries(raw.annotations ?? {})) {
    annotations[Number(k)] = v
  }
  return {
    markdown: raw.markdown,
    annotations,
    cases: raw.cases,
    _cost_cents: raw._cost_cents,
    _balance_cents: raw._balance_cents,
  }
}

/* ----------------------------------------------------------------------------
 * /corpus/usc/* — USC (United States Code) spoke
 *
 * First non-litigation corpus. Different schema (sections, not cases),
 * different ID column (`id` instead of `cl_id`), different facets (title +
 * positive-law + status + citation lookup instead of court + judge + date
 * range). v1 alpha is manual filter only.
 * ------------------------------------------------------------------------- */

export type UscTitle = {
  /** Title number (1-54; 54 is reserved). */
  num: number
  /** Title name in ALL CAPS — matches the published USC. */
  name: string
}

export type UscFacets = {
  section_count: number
  release_point: string
  titles: UscTitle[]
  /** Distinct `status` values (e.g. 'active', 'repealed', etc). */
  statuses: string[]
}

export async function fetchUscFacets(): Promise<UscFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/usc/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as UscFacets
}

/** Display row for the USC manual-filter results table. Mirrors the
 *  Worker's USC_DISPLAY_COLS. */
export type UscSectionDisplayRow = {
  id: number
  title_num: number | null
  title_name: string | null
  citation: string | null
  heading: string | null
  section_identifier: string | null
  is_positive_law: boolean | null
  status: string | null
  text_length: number | null
}

/** Filter fields accepted by /corpus/usc/filter. Mirrors buildUscFilterWhere
 *  in worker/index.js. Empty/undefined fields are dropped server-side. */
export type UscFilterFields = {
  /** FTS over usc_sections.fts (websearch_to_tsquery). */
  search?: string
  /** Exact match on title_num. */
  title?: number
  /** Exact match on canonical citation, e.g. "8 U.S.C. § 1225". */
  citation?: string
  /** ILIKE substring on heading. */
  heading?: string
  /** Filter to positive-law (true) / non-positive (false) / either (undefined). */
  positiveLaw?: boolean
  /** Exact match on status. */
  status?: string
}

export type UscFilterResult = {
  ids: number[]
  display_rows: UscSectionDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runUscFilter(
  fields: UscFilterFields,
): Promise<UscFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/usc/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as UscFilterResult
}

/**
 * Full single-section detail used by the USC section panel. Includes the
 * statutory `text_content` plus the full hierarchy chain (subtitle,
 * chapter, subchapter, part) that the panel renders as a breadcrumb. The
 * list endpoint omits `text_content` to keep the table payload small;
 * this round-trip happens only when the user actually opens a section.
 */
export type UscSectionDetail = {
  id: number
  title_num: number | null
  title_name: string | null
  subtitle: string | null
  chapter: string | null
  subchapter: string | null
  part: string | null
  structure_path: string | null
  section_identifier: string | null
  section_num: string | null
  citation: string | null
  heading: string | null
  text_content: string | null
  text_length: number | null
  source_credit: string | null
  notes: string | null
  status: string | null
  is_positive_law: boolean | null
  release_point: string | null
}

export async function fetchUscSection(id: number): Promise<UscSectionDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/section`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/usc/section failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { section: UscSectionDetail }
  return body.section
}

/* ----------------------------------------------------------------------------
 * USC AI modes (PR 4s) — three flagships (legality / authority / topical)
 * served via one claude_ama mode + summarize-one-section action on the
 * section detail. v1 ships single-corpus AI; cross-corpus joins (USC↔CFR/
 * OLC/litigation) per brief #3 §6 are deferred pending pipeline work.
 * ------------------------------------------------------------------------- */

export type UscAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type UscAmaSynthesis = {
  answer_markdown: string
  section_ids: number[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

export type UscAmaScope = {
  section_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runUscPlan(
  question: string,
  scope: UscAmaScope,
  auth: AuthArg,
): Promise<UscAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `USC plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as UscAmaPlan
}

export async function runUscExecute(
  token: string,
  auth: AuthArg,
): Promise<UscAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `USC execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as UscAmaSynthesis
}

export type UscSectionSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizeUscSection(
  id: number,
  auth: AuthArg,
): Promise<UscSectionSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/usc/summarize-section`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `USC summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as UscSectionSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/cfr/* — CFR (Code of Federal Regulations) spoke
 *
 * Second non-litigation, second non-USC corpus. Schema parallels USC closely
 * but with regulation-specific concepts: `reserved` placeholder sections (no
 * positive-law idea), per-section `up_to_date_as_of` + `latest_amended_on`
 * date currency, and a shallower hierarchy (chapter → part → subpart →
 * section, no subtitle).
 * ------------------------------------------------------------------------- */

export type CfrTitle = {
  num: number
  name: string
}

export type CfrFacets = {
  section_count: number
  /** Latest `up_to_date_as_of` across the corpus (YYYY-MM-DD). */
  up_to_date_as_of: string
  /** Count of `reserved` placeholder sections — surfaced so the UI can
   *  show "227,554 (incl. 6,949 reserved)" in the holdings band. */
  reserved_count: number
  titles: CfrTitle[]
}

export async function fetchCfrFacets(): Promise<CfrFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/cfr/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CfrFacets
}

export type CfrSectionDisplayRow = {
  id: number
  title_num: number | null
  title_name: string | null
  citation: string | null
  heading: string | null
  section_identifier: string | null
  reserved: boolean | null
  source: string | null
  text_length: number | null
  up_to_date_as_of: string | null
}

export type CfrFilterFields = {
  search?: string
  title?: number
  /** Canonical citation, e.g. "45 CFR § 164.502". */
  citation?: string
  /** Heading substring (ILIKE %heading%). */
  heading?: string
  /** Exact match on the `part` field (e.g. "164"). */
  part?: string
  /** undefined = include both; true = reserved only; false = exclude reserved. */
  reserved?: boolean
}

export type CfrFilterResult = {
  ids: number[]
  display_rows: CfrSectionDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runCfrFilter(
  fields: CfrFilterFields,
): Promise<CfrFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/cfr/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CfrFilterResult
}

export type CfrSectionDetail = {
  id: number
  title_num: number | null
  title_name: string | null
  chapter: string | null
  part: string | null
  subpart: string | null
  structure_path: string | null
  section_identifier: string | null
  citation: string | null
  heading: string | null
  text_content: string | null
  text_length: number | null
  reserved: boolean | null
  source: string | null
  /** YYYY-MM-DD — latest corpus-wide ingest currency at section level. */
  up_to_date_as_of: string | null
  /** YYYY-MM-DD — when this section was last amended (regulation-specific). */
  latest_amended_on: string | null
}

export async function fetchCfrSection(id: number): Promise<CfrSectionDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/section`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/cfr/section failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { section: CfrSectionDetail }
  return body.section
}

/* ----------------------------------------------------------------------------
 * CFR AI modes (PR 4t) — three flagships (compliance / authority / framework
 * synthesis) served via one claude_ama mode + summarize-one-section action
 * on the section detail.
 * ------------------------------------------------------------------------- */

export type CfrAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type CfrAmaSynthesis = {
  answer_markdown: string
  section_ids: number[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

export type CfrAmaScope = {
  section_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runCfrPlan(
  question: string,
  scope: CfrAmaScope,
  auth: AuthArg,
): Promise<CfrAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `CFR plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CfrAmaPlan
}

export async function runCfrExecute(
  token: string,
  auth: AuthArg,
): Promise<CfrAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `CFR execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CfrAmaSynthesis
}

export type CfrSectionSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizeCfrSection(
  id: number,
  auth: AuthArg,
): Promise<CfrSectionSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/cfr/summarize-section`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `CFR summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CfrSectionSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/olc/* — OLC (DOJ Office of Legal Counsel opinions) spoke
 *
 * Third reference-style spoke. Atomic unit is an opinion (not a section);
 * the corpus is small (2,145) and flat — no hierarchy chain. Per brief #2
 * OLC is paradigmatically analytical/narrative; v1 alpha is the metadata
 * floor (title / author / source / date range / OCR quality + FTS).
 * ------------------------------------------------------------------------- */

/** Tuple of (value, count) used for source + OCR quality dropdowns. */
export type OlcFacetCount = {
  value: string
  count: number
}

export type OlcFacets = {
  opinion_count: number
  /** Earliest date_issued across the corpus (YYYY-MM-DD). */
  earliest: string
  /** Most recent date_issued (YYYY-MM-DD). */
  latest: string
  /** ['doj-published', 'knight-foia'] with counts. */
  sources: OlcFacetCount[]
  /** ['clean', 'degraded', 'normalized'] with counts. */
  ocr_qualities: OlcFacetCount[]
}

export async function fetchOlcFacets(): Promise<OlcFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/olc/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as OlcFacets
}

export type OlcOpinionDisplayRow = {
  id: number
  title: string | null
  author: string | null
  date_issued: string | null
  source: string | null
  /** DOJ-published canonical URL (justice.gov/olc/file/...). Added PR 4v so
   *  result rows + AMA cited rows can render the audit-link affordance
   *  without a follow-up detail fetch. */
  source_url_doj: string | null
  /** Knight FOIA source URL for opinions DOJ never published. */
  source_url_knight: string | null
  page_count: number | null
  text_length: number | null
  ocr_quality: string | null
}

export type OlcFilterFields = {
  search?: string
  /** Substring (ILIKE %title%) on opinion title. */
  title?: string
  /** Substring on author. */
  author?: string
  /** Exact match — 'doj-published' or 'knight-foia'. */
  source?: string
  /** ISO YYYY-MM-DD lower bound on date_issued. */
  from?: string
  /** ISO YYYY-MM-DD upper bound. */
  to?: string
  /** Exact match on ocr_quality. */
  ocrQuality?: string
}

export type OlcFilterResult = {
  ids: number[]
  display_rows: OlcOpinionDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runOlcFilter(
  fields: OlcFilterFields,
): Promise<OlcFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/olc/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as OlcFilterResult
}

export type OlcOpinionDetail = {
  id: number
  title: string | null
  author: string | null
  recipient: string | null
  president: string | null
  date_issued: string | null
  release_date: string | null
  summary: string | null
  summary_source: string | null
  source: string | null
  source_url_doj: string | null
  source_url_knight: string | null
  doj_dl_path: string | null
  knight_doc_id: string | null
  volume: string | null
  page: string | null
  page_count: number | null
  text_length: number | null
  text_content: string | null
  ocr_quality: string | null
  dedup_key: string | null
}

export async function fetchOlcOpinion(id: number): Promise<OlcOpinionDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/opinion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/olc/opinion failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { opinion: OlcOpinionDetail }
  return body.opinion
}

/* ----------------------------------------------------------------------------
 * OLC AI modes (PR 4q) — narrative synthesis + summarize-one-opinion
 *
 * Brief #2 §3 names two AI surfaces:
 *   1. Narrative synthesis (the flagship). Plan + execute against
 *      olc_opinions, paralleling litigation's /corpus/{plan,execute}. The
 *      worker stores the plan under a one-shot KV token; execute resolves it.
 *   2. Summarize one opinion. Invoked from the opinion detail panel — not a
 *      mode. Single billed call against one opinion's text_content.
 *
 * Both endpoints reuse the existing pre-flight cost-disclosure pattern from
 * litigation's AMA (AMA_CONFIRM_THRESHOLD_CENTS).
 * ------------------------------------------------------------------------- */

/** OLC plan returned by /corpus/olc/plan. Same shape as litigation's AmaPlan;
 *  the citation idiom is OLC-specific ([olc-ref:OPINION_ID]). */
export type OlcAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

/** OLC synthesis returned by /corpus/olc/execute. `opinion_ids` (not
 *  `cl_ids`) for list/hybrid modes. */
export type OlcAmaSynthesis = {
  answer_markdown: string
  opinion_ids: number[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

/** Scope payload accepted by /corpus/olc/plan. `opinion_ids` for a narrowed
 *  scope; otherwise the full corpus. (No scope_sql analog — OLC is small
 *  enough to always inline.) */
export type OlcAmaScope = {
  opinion_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runOlcPlan(
  question: string,
  scope: OlcAmaScope,
  auth: AuthArg,
): Promise<OlcAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `OLC plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as OlcAmaPlan
}

export async function runOlcExecute(
  token: string,
  auth: AuthArg,
): Promise<OlcAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `OLC execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as OlcAmaSynthesis
}

/** Summary returned by /corpus/olc/summarize-opinion. `was_truncated` is true
 *  when the opinion's text exceeded the worker's input cap and only the head
 *  was sent to the model. */
export type OlcOpinionSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizeOlcOpinion(
  id: number,
  auth: AuthArg,
): Promise<OlcOpinionSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/olc/summarize-opinion`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    // Reuse WorkerAmaError so the spoke UI can surface error.code (e.g.
    // 'no_text' for opinions with empty text_content) uniformly.
    throw new WorkerAmaError(
      body.error?.message ?? `OLC summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as OlcOpinionSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/lawfare/* — Lawfare (Lawfare's own published archive) spoke
 *
 * The platform's first COMMENTARY corpus — articles, podcast episodes, and
 * newsletters from lawfaremedia.org. Atomic unit is an article/item (string
 * id). Author and Topic are first-class facets (unlike OLC). Paradigmatically
 * analytical/narrative: "what has Lawfare written/argued about X", synthesized
 * WITH per-author, per-piece attribution — it surfaces what authors said,
 * never adjudicates which view is right.
 * ------------------------------------------------------------------------- */

/** (value, count) pairs used for the content-type / series facet dropdowns. */
export type LawfareFacetCount = {
  value: string
  count: number
}

/** A top author facet — slug + display name + count. */
export type LawfareAuthorFacet = {
  slug: string
  name: string
  count: number
}

/** A topic facet — slug + display name + count. */
export type LawfareTopicFacet = {
  value: string
  count: number
}

export type LawfareFacets = {
  document_count: number
  /** Earliest published_date across the corpus (YYYY-MM-DD). */
  earliest: string
  /** Most recent published_date (YYYY-MM-DD). */
  latest: string
  /** ['article', 'podcast', 'newsletter'] with counts. */
  content_types: LawfareFacetCount[]
  /** The ~13 controlled topics with counts. */
  topics: LawfareTopicFacet[]
  /** Named series (e.g. recurring columns / podcast shows) with counts. */
  series: LawfareFacetCount[]
  /** Most-published authors — drives the searchable author select. */
  top_authors: LawfareAuthorFacet[]
}

export async function fetchLawfareFacets(): Promise<LawfareFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/lawfare/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as LawfareFacets
}

export type LawfareArticleDisplayRow = {
  id: string
  slug: string | null
  title: string | null
  dek: string | null
  author_names: string[]
  published_date: string | null
  topic_names: string[]
  content_type: string | null
  series: string | null
  canonical_url: string | null
  text_length: number | null
  quality: string | null
  search_tier: string | null
}

export type LawfareFilterFields = {
  /** FTS over body text + title + dek. */
  q?: string
  /** Exact match on an author slug (from the top_authors facet). */
  author_slug?: string
  /** Case-insensitive author-name substring — reaches authors outside the
   *  top-authors dropdown (slugs are an opaque scheme users can't derive). */
  author_name?: string
  /** Exact match on a topic slug (from the controlled topic facet). */
  topic_slug?: string
  /** 'article' | 'podcast' | 'newsletter'. */
  content_type?: string
  /** Exact match on a named series. */
  series?: string
  /** ISO YYYY-MM-DD lower bound on published_date. */
  date_from?: string
  /** ISO YYYY-MM-DD upper bound. */
  date_to?: string
  /** When true, include roundups & announcements (suppressed by default). */
  include_suppressed?: boolean
}

export type LawfareFilterResult = {
  ids: string[]
  display_rows: LawfareArticleDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runLawfareFilter(
  fields: LawfareFilterFields,
): Promise<LawfareFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/lawfare/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as LawfareFilterResult
}

export type LawfareArticleDetail = {
  id: string
  slug: string | null
  title: string | null
  dek: string | null
  author_names: string[]
  author_slugs: string[]
  published_date: string | null
  published_raw: string | null
  topic_names: string[]
  topic_slugs: string[]
  content_type: string | null
  series: string | null
  canonical_url: string | null
  text_length: number | null
  quality: string | null
  search_tier: string | null
  body_text: string | null
  body_html: string | null
}

export async function fetchLawfareArticle(
  id: string,
): Promise<LawfareArticleDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/article`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/lawfare/article failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { article: LawfareArticleDetail }
  return body.article
}

/* ----------------------------------------------------------------------------
 * Lawfare AI modes — narrative synthesis + summarize-one-article
 *
 * Same plan/execute shape as OLC, with Lawfare-specific citation idiom
 * ([lawfare-ref:ARTICLE_ID]) and the attribution-forward editorial register
 * (synthesis attributes views to authors + pieces, never adjudicates).
 * ------------------------------------------------------------------------- */

/** Lawfare plan returned by /corpus/lawfare/plan. Same shape as OLC's. */
export type LawfareAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

/** Lawfare synthesis returned by /corpus/lawfare/execute. `article_ids`
 *  (string ids) for list/hybrid modes. */
export type LawfareAmaSynthesis = {
  answer_markdown: string
  article_ids: string[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

/** Scope payload accepted by /corpus/lawfare/plan. `article_ids` for a
 *  narrowed scope; otherwise the full corpus. */
export type LawfareAmaScope = {
  article_ids?: string[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runLawfarePlan(
  question: string,
  scope: LawfareAmaScope,
  auth: AuthArg,
): Promise<LawfareAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Lawfare plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as LawfareAmaPlan
}

export async function runLawfareExecute(
  token: string,
  auth: AuthArg,
): Promise<LawfareAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Lawfare execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as LawfareAmaSynthesis
}

/** Summary returned by /corpus/lawfare/summarize-article. `was_truncated` is
 *  true when the article's text exceeded the worker's input cap. */
export type LawfareArticleSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizeLawfareArticle(
  id: string,
  auth: AuthArg,
): Promise<LawfareArticleSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/summarize-article`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Lawfare summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as LawfareArticleSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/frus/* — FRUS (Foreign Relations of the United States) spoke
 *
 * Final v1 spoke. Two tables in the corpus: frus_documents (314K docs) +
 * frus_volumes (694 volumes; 552 with docs loaded, 142 placeholder for the
 * lagging-publication tail). Atomic unit is the document; the natural
 * browse spine is the volume.
 * ------------------------------------------------------------------------- */

export type FrusClassificationCount = {
  value: string
  count: number
}

export type FrusFacets = {
  document_count: number
  volume_count: number
  /** Volumes with at least one loaded document (552 of 694 today). */
  volumes_with_docs: number
  /** Earliest doc_date (YYYY-MM-DD). */
  earliest: string
  /** Most recent doc_date (YYYY-MM-DD). */
  latest: string
  /** ~102 distinct sub_series values, e.g. "1969-1976", "Truman". */
  sub_series: string[]
  /** Classification enum: Secret / Confidential / Top Secret / etc. */
  classifications: FrusClassificationCount[]
}

export async function fetchFrusFacets(): Promise<FrusFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/frus/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FrusFacets
}

export type FrusDocumentDisplayRow = {
  id: number
  title: string | null
  doc_date: string | null
  volume_id: string | null
  place_name: string | null
  classification: string | null
  /** Canonical history.state.gov URL. 100% populated in the corpus (verified
   *  empirically). Added to the display row in PR 4v so every surface that
   *  mentions a FRUS document can carry the audit link without an extra
   *  detail fetch (brief #1 §4b auditability). */
  source_url: string | null
  text_length: number | null
}

export type FrusFilterFields = {
  search?: string
  title?: string
  /** Exact match on volume_id (e.g. "frus1969-76v01"). */
  volumeId?: string
  /** Exact match through frus_volumes JOIN. */
  subSeries?: string
  /** Exact match on classification. */
  classification?: string
  /** ISO YYYY-MM-DD lower bound on doc_date. */
  from?: string
  /** ISO YYYY-MM-DD upper bound. */
  to?: string
  /** Substring on place_name. */
  place?: string
}

export type FrusFilterResult = {
  ids: number[]
  display_rows: FrusDocumentDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runFrusFilter(
  fields: FrusFilterFields,
): Promise<FrusFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/frus/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FrusFilterResult
}

/** Persons jsonb field — one entry per person mentioned/involved. The
 *  exact shape varies across volumes (the corpus is historical XML).
 *  Render as best-effort: prefer canonical fields, fall back to JSON
 *  stringification for unfamiliar shapes. */
export type FrusPerson = {
  id?: string
  name?: string
  role?: string
  [k: string]: unknown
}

export type FrusDocumentDetail = {
  id: number
  volume_id: string | null
  element_id: string | null
  doc_number: string | null
  title: string | null
  doc_date: string | null
  doc_datetime_min: string | null
  doc_datetime_max: string | null
  place_name: string | null
  source_note: string | null
  classification: string | null
  text_content: string | null
  text_length: number | null
  persons: FrusPerson[] | null
  glossary: unknown
  footnotes: unknown
  source_url: string | null
  /** From the JOINed frus_volumes row. */
  volume_title: string | null
  sub_series: string | null
  volume_number: string | null
  volume_content_date_min: string | null
  volume_content_date_max: string | null
}

export async function fetchFrusDocument(id: number): Promise<FrusDocumentDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/frus/document failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { document: FrusDocumentDetail }
  return body.document
}

/* ----------------------------------------------------------------------------
 * FRUS AI modes (PR 4r) — narrative synthesis + summarize-one-document
 *
 * Brief #5 §3 names three asymmetric flagships (narrative = paradigmatic;
 * coverage/existence + specific document retrieval secondary). All three
 * are served via ONE claude_ama mode whose `output_mode` discriminator
 * (`narrative` / `hybrid` / `list`) maps to the flagships internally per
 * the "no query-architecture buttons" principle.
 * ------------------------------------------------------------------------- */

export type FrusAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type FrusAmaSynthesis = {
  answer_markdown: string
  /** Non-null only for `list` / `hybrid` output modes. The FRUS-specific
   *  field name; opinion_ids / cl_ids on other spokes. */
  document_ids: number[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

/** FRUS scope. The Worker caps the inline document_ids list at 25K; over
 *  that the executor refuses with a "narrow further" error. */
export type FrusAmaScope = {
  document_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runFrusPlan(
  question: string,
  scope: FrusAmaScope,
  auth: AuthArg,
): Promise<FrusAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `FRUS plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrusAmaPlan
}

export async function runFrusExecute(
  token: string,
  auth: AuthArg,
): Promise<FrusAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `FRUS execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrusAmaSynthesis
}

export type FrusDocumentSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizeFrusDocument(
  id: number,
  auth: AuthArg,
): Promise<FrusDocumentSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/frus/summarize-document`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `FRUS summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrusDocumentSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/plan + /corpus/execute — agentic AMA ("claude_ama" mode)
 *
 * Two-pass surface. Phase 1 (plan) runs a planning LLM call against question +
 * scope, stores the plan server-side under an opaque `token`, and returns a
 * display copy (approach summary, output mode, candor notes, query labels) +
 * an estimated cost. Phase 2 (execute) runs the STORED plan's SQL against the
 * corpus and synthesizes the answer; the token is one-shot. Between the two
 * phases the UI shows a pre-flight modal (in paid mode) or just logs the
 * estimate (in BYOK mode) — legacy index.html behavior, faithfully ported.
 * ------------------------------------------------------------------------- */

/** Output shape decided by the agent during planning. */
export type AmaOutputMode = 'list' | 'narrative' | 'hybrid'

/** Per-query metadata returned in the plan's display copy. The SQL is shown
 *  for transparency (brief #6 §7b auditability); the Worker re-executes from
 *  the SERVER-STORED plan, not from this copy. */
export type AmaPlanQuery = { label: string; sql: string }

/** Plan returned by /corpus/plan. `token` is opaque — the Worker dereferences
 *  it during /corpus/execute. */
export type AmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

/** Synthesis returned by /corpus/execute. For `list` / `hybrid` mode the
 *  agent returns `cl_ids` — the narrowed subset. For `narrative` mode the
 *  rows pass through unchanged. */
export type AmaSynthesis = {
  answer_markdown: string
  /** Non-null only for `list` / `hybrid` outputs. */
  cl_ids: number[] | null
  candor_notes: string[]
  output_mode: AmaOutputMode
  query_summary: Array<{
    label: string
    total_rows: number
    was_truncated: boolean
  }>
  _cost_cents?: number
  _balance_cents?: number
}

/** Scope payload accepted by /corpus/plan. Either `cl_ids` (inlined for small
 *  scopes) or `scope_sql` (for large scopes); both omitted = the full corpus. */
export type AmaScope = {
  cl_ids?: number[] | null
  scope_sql?: string | null
  is_full_db?: boolean
  count?: number
  description?: string
}

/** Legacy index.html threshold — pre-flight modal only fires when the
 *  estimated cost exceeds this. Matches CONFIRM_THRESHOLD_CENTS in
 *  index.html v9.x. */
export const AMA_CONFIRM_THRESHOLD_CENTS = 25

export class WorkerAmaError extends Error {
  step: 'plan' | 'execute'
  status: number
  code?: string
  constructor(
    message: string,
    step: 'plan' | 'execute',
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'WorkerAmaError'
    this.step = step
    this.status = status
    this.code = code
  }
}

export async function runClaudePlan(
  question: string,
  scope: AmaScope,
  auth: AuthArg,
): Promise<AmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/plan`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      question,
      scope,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as AmaPlan
}

export async function runClaudeExecute(
  token: string,
  auth: AuthArg,
): Promise<AmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      // BYOK still carries the api key in the body; paid mode adds nothing
      // here since the JWT is on the Authorization header.
      ...authCredentialBody(auth),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as AmaSynthesis
}

/* ----------------------------------------------------------------------------
 * /corpus/cases — display rows by id-set
 *
 * Used by claude_ama when the synthesis returns narrowed cl_ids but the
 * incoming scope was the full corpus (no local row cache to filter against).
 * ------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------
 * /api/checkout — Stripe Checkout session for paid-tier top-up
 * ------------------------------------------------------------------------- */

/** Block sizes the Worker accepts (drives Stripe price-ID lookup). */
export type TopupBlock = '5' | '20' | '50'

export type CheckoutSession = {
  checkout_url: string
  session_id: string
}

/**
 * Start a Stripe Checkout session for the signed-in paid user. The Worker
 * returns a URL the user should be redirected to; on completion Stripe
 * sends them back to the configured success/cancel URL plus the webhook
 * fires asynchronously to credit the balance.
 *
 * `returnOrigin` is the current page's origin — the Worker validates it
 * against an allowlist (production + localhost dev) before using it as
 * the post-checkout redirect base. Caller passes window.location.origin.
 */
export async function startCheckout(opts: {
  block: TopupBlock
  sessionToken: string
  returnOrigin: string
}): Promise<CheckoutSession> {
  const r = await fetch(`${WORKER_URL}/api/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${opts.sessionToken}`,
    },
    body: JSON.stringify({
      block: opts.block,
      return_origin: opts.returnOrigin,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(
      body.error?.message ?? `Checkout failed (${r.status})`,
    )
  }
  return (await r.json()) as CheckoutSession
}

export async function fetchCasesByIds(
  ids: readonly number[],
): Promise<CaseDisplayRow[]> {
  if (ids.length === 0) return []
  const r = await fetch(`${WORKER_URL}/corpus/cases`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/cases failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { rows: CaseDisplayRow[] }
  return body.rows
}

/* ----------------------------------------------------------------------------
 * /corpus/read-batch — per-case AI keep/drop judgment ("claude_read" mode)
 * ------------------------------------------------------------------------- */

/** One AI verdict on a case. Shape matches the Worker's parseReadBatch output. */
export type ReadVerdict = {
  cl_id: number
  keep: boolean
  reason: string
}

export type ReadBatchResult = {
  verdicts: ReadVerdict[]
  _cost_cents?: number
  _balance_cents?: number
}

/** Tuning knobs ported from index.html — small enough to be hand-curated and
 *  worth keeping near the orchestrator that uses them. */
export const READ_BATCH_SIZE = 25 // cases per /corpus/read-batch call
export const READ_CONCURRENCY = 4 // parallel in-flight calls
export const READ_MAX_BATCH = 100 // Worker hard cap per batch

/** Single /corpus/read-batch call against a slice of case IDs. */
export async function runReadBatch(
  criterion: string,
  clIds: readonly number[],
  auth: AuthArg,
): Promise<ReadBatchResult> {
  if (clIds.length === 0) return { verdicts: [] }
  if (clIds.length > READ_MAX_BATCH) {
    throw new Error(`Batch too large: ${clIds.length} > ${READ_MAX_BATCH}`)
  }
  const r = await fetch(`${WORKER_URL}/corpus/read-batch`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      criterion,
      cl_ids: clIds,
    }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/read-batch failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as ReadBatchResult
}

/**
 * Orchestrator — reads all cases in `clIds` against `criterion`, batching to
 * READ_BATCH_SIZE and running READ_CONCURRENCY batches in flight at a time.
 * Calls `onProgress` after each completed batch so the UI can update a
 * "Reading N / M cases…" status line.
 *
 * On batch failure: that batch's cases get marked dropped with the error
 * message as the reason (same shape as legacy index.html). The orchestrator
 * itself does NOT throw — partial results are useful.
 */
export async function runClaudeRead(opts: {
  criterion: string
  clIds: readonly number[]
  auth: AuthArg
  onProgress?: (completed: number, total: number) => void
  signal?: AbortSignal
}): Promise<{ verdicts: Record<number, { keep: boolean; reason: string }> }> {
  const { criterion, clIds, auth, onProgress, signal } = opts
  const batches: number[][] = []
  for (let i = 0; i < clIds.length; i += READ_BATCH_SIZE) {
    batches.push([...clIds.slice(i, i + READ_BATCH_SIZE)])
  }
  const verdicts: Record<number, { keep: boolean; reason: string }> = {}
  let completed = 0
  onProgress?.(0, clIds.length)

  // Concurrency-limited fan-out. Each "worker" pulls the next index off a
  // shared cursor and runs its batch until none are left.
  let cursor = 0
  async function workerLoop() {
    while (true) {
      if (signal?.aborted) return
      const i = cursor++
      if (i >= batches.length) return
      const batch = batches[i]
      try {
        const r = await runReadBatch(criterion, batch, auth)
        for (const v of r.verdicts) {
          verdicts[v.cl_id] = { keep: v.keep, reason: v.reason }
        }
        for (const id of batch) {
          if (!(id in verdicts)) {
            verdicts[id] = { keep: false, reason: 'no judgment returned' }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        for (const id of batch) {
          verdicts[id] = { keep: false, reason: `batch failed: ${msg}` }
        }
      } finally {
        completed += batch.length
        onProgress?.(Math.min(completed, clIds.length), clIds.length)
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, batches.length) },
    () => workerLoop(),
  )
  await Promise.all(workers)
  return { verdicts }
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
 * items-by-ids (PR 4v) — AMA cited-result polish
 *
 * AMA synthesis returns a list of <doc>_ids. PR 4q–4t shipped "Doc #N"
 * button stubs as a v1 shortcut. This endpoint per spoke returns the
 * metadata-rich display rows for an id list, in caller-supplied order,
 * so the AMA cited list can render with the same shape as the manual-
 * filter result list (Note 1 from Ben's testing pass; brief #1 §4b
 * auditability).
 * ------------------------------------------------------------------------- */

async function fetchItemsByIds<Row, Id = number>(
  url: string,
  ids: readonly Id[],
): Promise<Row[]> {
  if (ids.length === 0) return []
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`${url} failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { display_rows: Row[] }
  return body.display_rows
}

export function fetchUscItemsByIds(
  ids: readonly number[],
): Promise<UscSectionDisplayRow[]> {
  return fetchItemsByIds<UscSectionDisplayRow>(
    `${WORKER_URL}/corpus/usc/items-by-ids`,
    ids,
  )
}

export function fetchCfrItemsByIds(
  ids: readonly number[],
): Promise<CfrSectionDisplayRow[]> {
  return fetchItemsByIds<CfrSectionDisplayRow>(
    `${WORKER_URL}/corpus/cfr/items-by-ids`,
    ids,
  )
}

export function fetchOlcItemsByIds(
  ids: readonly number[],
): Promise<OlcOpinionDisplayRow[]> {
  return fetchItemsByIds<OlcOpinionDisplayRow>(
    `${WORKER_URL}/corpus/olc/items-by-ids`,
    ids,
  )
}

export function fetchFrusItemsByIds(
  ids: readonly number[],
): Promise<FrusDocumentDisplayRow[]> {
  return fetchItemsByIds<FrusDocumentDisplayRow>(
    `${WORKER_URL}/corpus/frus/items-by-ids`,
    ids,
  )
}

export function fetchLawfareItemsByIds(
  ids: readonly string[],
): Promise<LawfareArticleDisplayRow[]> {
  return fetchItemsByIds<LawfareArticleDisplayRow, string>(
    `${WORKER_URL}/corpus/lawfare/items-by-ids`,
    ids,
  )
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
