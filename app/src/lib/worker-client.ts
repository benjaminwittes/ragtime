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
 * /corpus/hub/ama/{plan,execute} (features stream #3, step 3) — cross-corpus
 * semantic Hub AMA.
 *
 * The semantic counterpart to /corpus/hub/keyword. Because every corpus lives
 * in one embedding space, cosine similarity is comparable ACROSS corpora, so
 * the hub returns a single unified cross-corpus ranking (the keyword hub can
 * only group, never merge). Two-call free-base / paid-report split, mirroring
 * the spoke plan/execute:
 *
 *   plan    — FREE + IP-rate-limited. Embeds the question once, fans
 *             semantic_search across the embedded corpora, returns the unified
 *             ranking (+ per-corpus groups + routing counts) and a one-shot
 *             token. No model call.
 *   execute — AUTH-GATED + CHARGED. Synthesizes a cited, grouped-by-corpus
 *             report (research-librarian voice) over exactly the passages the
 *             plan surfaced; sources are filtered to the supplied set so the
 *             model can't cite anything the user didn't see.
 *
 * `output_mode` classifies the question shape server-side: "question" warrants
 * a synthesized report; "lookup" is a bare term that should show docs only.
 * ------------------------------------------------------------------------- */

/** One responsive document in the unified cross-corpus ranking. */
export type HubAmaResultItem = {
  corpus: HubCorpusSlug
  /** Corpus-native PK, serialized as text (bigint-safe). */
  id: string
  /** Cosine similarity in [0,1] — comparable across corpora. */
  similarity: number
  title: string
  context: string | null
  date: string | null
  /** Leading passage text (≤320 chars server-side). */
  snippet: string | null
}

/** Per-corpus group — the same items, bucketed by corpus for grouped display
 *  and the routing/handoff chips. `error` is set (with empty items) when that
 *  corpus's retrieval branch failed; other corpora still return. */
export type HubAmaGroup = {
  corpus: HubCorpusSlug
  count: number
  error: string | null
  items: HubAmaResultItem[]
}

export type HubAmaPlanResponse = {
  /** One-shot token the execute leg synthesizes over (KV TTL ~15 min). */
  token: string
  question: string
  /** "question" → a report is warranted; "lookup" → show docs only. */
  output_mode: 'question' | 'lookup'
  groups: HubAmaGroup[]
  /** The unified cross-corpus ranking (the free base layer). */
  results: HubAmaResultItem[]
  /** Count of responsive docs per corpus, for the handoff chips. */
  routing: Partial<Record<HubCorpusSlug, number>>
}

export type HubAmaSource = { corpus: HubCorpusSlug; id: string }

export type HubAmaReport = {
  /** The cited answer, Markdown. */
  answer_markdown: string
  /** Every passage the model cited — filtered server-side to the plan set. */
  sources: HubAmaSource[]
  /** Gaps / caveats / contested points the model flagged. */
  candor_notes: string[]
  _cost_cents?: number
  _balance_cents?: number
}

/** Thrown by hubAmaExecute on a non-2xx; `code` carries the Worker's error
 *  code (e.g. "plan_expired" on a 410) so the UI can offer a re-run. */
export class HubAmaError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'HubAmaError'
    this.status = status
    this.code = code
  }
}

/** FREE: embed + cross-corpus retrieve. No auth. Optional `corpora` narrows
 *  the span (unknown/unembedded slugs are dropped server-side). */
export async function hubAmaPlan(
  question: string,
  corpora?: readonly HubCorpusSlug[],
): Promise<HubAmaPlanResponse> {
  const r = await fetch(`${WORKER_URL}/corpus/hub/ama/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question,
      ...(corpora && corpora.length > 0 ? { corpora } : {}),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new HubAmaError(
      body.error?.message ?? `/corpus/hub/ama/plan failed (${r.status})`,
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as HubAmaPlanResponse
}

/** CHARGED: synthesize the cited report over a plan token. The plan fixed the
 *  responsive set; only the token + auth credential travel here. */
export async function hubAmaExecute(
  token: string,
  auth: AuthArg,
): Promise<HubAmaReport> {
  const r = await fetch(`${WORKER_URL}/corpus/hub/ama/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      token,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new HubAmaError(
      body.error?.message ?? `Report failed (${r.status})`,
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as HubAmaReport
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
 * /corpus/snippets — lazy per-page match highlights
 * ------------------------------------------------------------------------- */

/** Highlight delimiters the Worker wraps around matched terms in each snippet
 *  (Unicode Private-Use chars that never occur in docket text). The renderer
 *  splits on these to wrap matches in <mark>. Kept in sync with the Worker's
 *  SNIPPET_HL_START / SNIPPET_HL_STOP. */
export const SNIPPET_HL_START = '\uE000'
export const SNIPPET_HL_STOP = '\uE001'

/**
 * Fetch keyword-match snippets for a set of cases. Given the cl_ids the user is
 * currently looking at + the keyword that produced them, the Worker returns one
 * highlighted `ts_headline` fragment per case (where a snippet exists). Computed
 * lazily for the visible rows only — see the Worker's corpusSnippetsHandler for
 * why this isn't folded into /corpus/filter. Returns {} on any error (snippets
 * are a non-essential enhancement; a failure must never block the results).
 */
export async function fetchMatchSnippets(
  clIds: number[],
  search: string,
): Promise<Record<number, string>> {
  if (!search.trim() || clIds.length === 0) return {}
  try {
    const r = await fetch(`${WORKER_URL}/corpus/snippets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cl_ids: clIds, search }),
    })
    if (!r.ok) return {}
    const data = (await r.json()) as { snippets?: Record<string, string> }
    const out: Record<number, string> = {}
    for (const [k, v] of Object.entries(data.snippets ?? {})) {
      if (typeof v === 'string' && v) out[Number(k)] = v
    }
    return out
  } catch {
    return {}
  }
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
 * /corpus/presidential/* — Presidential Documents spoke (brief #11)
 *
 * The formal signed instruments by which the President directs the executive
 * branch and the public: executive orders, proclamations, memoranda,
 * determinations, notices (12,654 documents, EOs back to 1940). Companion
 * parsed disposition graph (revokes/amends/supersedes — OFR-captured, not
 * inferred) rides along on the detail endpoint: the "is this still in
 * effect" trail.
 * ------------------------------------------------------------------------- */

export type PresidentialFacetCount = {
  value: string
  count: number
}

export type PresidentialPresidentCount = {
  slug: string
  name: string
  count: number
}

export type PresidentialFacets = {
  document_count: number
  /** Documents with body text (the rest are pre-1948 metadata-only finding aids). */
  with_text: number
  earliest: string
  latest: string
  doc_types: PresidentialFacetCount[]
  presidents: PresidentialPresidentCount[]
}

export async function fetchPresidentialFacets(): Promise<PresidentialFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/presidential/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as PresidentialFacets
}

export type PresidentialDocumentDisplayRow = {
  id: number
  doc_type: string | null
  /** Canonical human citation — 'Executive Order 14239', 'Memorandum of March 18, 2025'. */
  display_citation: string | null
  title: string | null
  president_name: string | null
  president_slug: string | null
  signing_date: string | null
  publication_date: string | null
  fr_citation: string | null
  eo_number: number | null
  proclamation_number: number | null
  agencies: string[] | null
  /** 'clean' | 'juris_backfill' | 'metadata_only' — the finding-aid badge keys off the last. */
  text_quality: string | null
  text_length: number | null
  html_url: string | null
  pdf_url: string | null
}

export type PresidentialFilterFields = {
  search?: string
  title?: string
  /** Exact: executive_order | proclamation | memorandum | determination | notice. */
  docType?: string
  /** Exact president_slug ('donald-trump', 'joe-biden'). */
  president?: string
  /** Direct EO-number lookup. */
  eoNumber?: number
  proclamationNumber?: number
  /** Substring over the implementing-agencies array. */
  agency?: string
  from?: string
  to?: string
  textQuality?: string
}

export type PresidentialFilterResult = {
  ids: number[]
  display_rows: PresidentialDocumentDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runPresidentialFilter(
  fields: PresidentialFilterFields,
): Promise<PresidentialFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/presidential/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as PresidentialFilterResult
}

/** One parsed disposition edge — outbound (what this document did to others). */
export type PresidentialDispositionOut = {
  relationship: string
  target_type: string
  target_eo_number: number | null
  target_proclamation_number: number | null
  target_date: string | null
  target_raw: string
  /** Resolved corpus row id, where the target is in the corpus. */
  target_id: number | null
  target_citation: string | null
  target_title: string | null
}

/** One parsed disposition edge — inbound (what later documents did to this one). */
export type PresidentialDispositionIn = {
  relationship: string
  target_raw: string
  source_id: number
  source_citation: string | null
  source_title: string | null
  source_signing_date: string | null
  source_president: string | null
}

export type PresidentialDocumentDetail = {
  id: number
  source_key: string | null
  document_number: string | null
  doc_type: string | null
  eo_number: number | null
  proclamation_number: number | null
  display_citation: string | null
  title: string | null
  president_slug: string | null
  president_name: string | null
  signing_date: string | null
  publication_date: string | null
  fr_citation: string | null
  agencies: string[] | null
  /** Raw OFR cross-reference string (the parsed edges are alongside). */
  disposition_notes: string | null
  cfr_codified_at: string | null
  text_quality: string | null
  body_text: string | null
  text_length: number | null
  html_url: string | null
  body_xml_url: string | null
  pdf_url: string | null
}

export type PresidentialDocumentResponse = {
  document: PresidentialDocumentDetail
  dispositions_out: PresidentialDispositionOut[]
  dispositions_in: PresidentialDispositionIn[]
}

export async function fetchPresidentialDocument(
  id: number,
): Promise<PresidentialDocumentResponse> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/presidential/document failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as PresidentialDocumentResponse
}

export type PresidentialAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type PresidentialAmaSynthesis = {
  answer_markdown: string
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

export type PresidentialAmaScope = {
  document_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runPresidentialPlan(
  question: string,
  scope: PresidentialAmaScope,
  auth: AuthArg,
): Promise<PresidentialAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/plan`, {
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
      body.error?.message ?? `Presidential plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as PresidentialAmaPlan
}

export async function runPresidentialExecute(
  token: string,
  auth: AuthArg,
): Promise<PresidentialAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/execute`, {
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
      body.error?.message ?? `Presidential execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as PresidentialAmaSynthesis
}

export type PresidentialDocumentSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function summarizePresidentialDocument(
  id: number,
  auth: AuthArg,
): Promise<PresidentialDocumentSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/presidential/summarize-document`, {
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
    // 'no_text' fires on pre-1948 metadata-only finding-aid rows.
    throw new WorkerAmaError(
      body.error?.message ?? `Presidential summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as PresidentialDocumentSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/fr/* — Federal Register spoke (brief #12)
 *
 * The daily journal of the executive branch: rules, proposed rules, and
 * notices, 1994→present (the FR API's digital floor). Rules + proposed
 * rules are complete; notices load in targeted waves (OFAC sanctions and
 * State Department designations first). The operative facts researchers
 * need — effective dates, comment windows, EO citations, CFR references —
 * ride on every row.
 * ------------------------------------------------------------------------- */

export type FrFacetCount = {
  value: string
  count: number
}

export type FrAgencyCount = {
  slug: string
  name: string
  count: number
}

export type FrFacets = {
  document_count: number
  earliest: string
  latest: string
  doc_types: FrFacetCount[]
  /** Top ~40 agencies by document count. */
  agencies: FrAgencyCount[]
  significant_count: number
  /** Documents whose comment window is still open (comments_close_on >= today). */
  open_for_comment_count: number
}

export async function fetchFrFacets(): Promise<FrFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/fr/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FrFacets
}

export type FrDocumentDisplayRow = {
  id: number
  /** 'rule' | 'proposed_rule' | 'notice'. */
  doc_type: string | null
  subtype: string | null
  /** FR document number — '2025-12760'. */
  document_number: string | null
  title: string | null
  agency_names: string[] | null
  significant: boolean | null
  regulation_id_numbers: string[] | null
  publication_date: string | null
  effective_on: string | null
  /** Comment-window close date — the operative fact when >= today. */
  comments_close_on: string | null
  /** '90 FR 30205'. */
  fr_citation: string | null
  text_length: number | null
  html_url: string | null
  pdf_url: string | null
}

export type FrFilterFields = {
  search?: string
  /** Exact: rule | proposed_rule | notice. */
  docType?: string
  /** Exact agency slug ('environmental-protection-agency'). */
  agencySlug?: string
  /** True = significant regulatory actions only (EO 12866). */
  significant?: boolean
  /** Regulation Identifier Number — '2060-AV09'. */
  rin?: string
  /** CFR reference containment — title number (e.g. 31). */
  cfrTitle?: number
  /** CFR reference containment — part (e.g. 594). */
  cfrPart?: number | string
  /** True = comment window still open (comments_close_on >= today). */
  openForComment?: boolean
  /** Publication-date range. */
  from?: string
  to?: string
  /** Effective-date range. */
  effectiveFrom?: string
  effectiveTo?: string
}

export type FrFilterResult = {
  ids: number[]
  display_rows: FrDocumentDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runFrFilter(
  fields: FrFilterFields,
): Promise<FrFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/fr/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FrFilterResult
}

/** One CFR reference — rendered as "31 CFR 594". */
export type FrCfrReference = {
  title: number | null
  part: string | null
  chapter: string | null
  citation_url: string | null
}

export type FrDocumentDetail = {
  id: number
  source_key: string | null
  document_number: string | null
  doc_type: string | null
  subtype: string | null
  title: string | null
  abstract: string | null
  /** The document's ACTION line — 'Final rule.', 'Notice of proposed rulemaking.'. */
  action: string | null
  fr_citation: string | null
  volume: number | null
  start_page: number | null
  end_page: number | null
  publication_date: string | null
  effective_on: string | null
  comments_close_on: string | null
  /** Raw DATES section text — the honest fallback when the parsed dates are null. */
  dates_text: string | null
  agency_names: string[] | null
  agency_slugs: string[] | null
  regulation_id_numbers: string[] | null
  docket_ids: string[] | null
  topics: string[] | null
  cfr_references: FrCfrReference[] | null
  significant: boolean | null
  /** Executive orders cited — numbers as strings ('14024'). */
  eo_citations: string[] | null
  text_quality: string | null
  body_text: string | null
  text_length: number | null
  html_url: string | null
  body_xml_url: string | null
  raw_text_url: string | null
  pdf_url: string | null
}

export type FrDocumentResponse = {
  document: FrDocumentDetail
}

export async function fetchFrDocument(id: number): Promise<FrDocumentResponse> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/fr/document failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as FrDocumentResponse
}

export type FrAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type FrAmaSynthesis = {
  answer_markdown: string
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

export type FrAmaScope = {
  document_ids?: number[] | null
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runFrPlan(
  question: string,
  scope: FrAmaScope,
  auth: AuthArg,
): Promise<FrAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/plan`, {
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
      body.error?.message ?? `Federal Register plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrAmaPlan
}

export async function runFrExecute(
  token: string,
  auth: AuthArg,
): Promise<FrAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/execute`, {
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
      body.error?.message ?? `Federal Register execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrAmaSynthesis
}

export type FrDocumentSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function runFrSummarizeDocument(
  id: number,
  auth: AuthArg,
): Promise<FrDocumentSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/fr/summarize-document`, {
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
      body.error?.message ?? `Federal Register summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as FrDocumentSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/congress/* — Congress spoke (brief #13)
 *
 * One spoke over five collections of the legislative record: public laws
 * (1789→), bills (108th Congress→; full text from the 113th), hearing
 * transcripts (1933→, with per-speaker turn attribution), the Congressional
 * Record (1994→), and written witness testimony (House, 118th–119th).
 * Every filter/document/items-by-ids call carries a `collection`
 * discriminator; the turns endpoint is the hearings collection's
 * "who said what" sub-surface.
 * ------------------------------------------------------------------------- */

export type CongressCollection =
  | 'laws'
  | 'bills'
  | 'hearings'
  | 'record'
  | 'testimony'

export type CongressCollectionStat = {
  count: number
  earliest: string
  latest: string
}

export type CongressCommitteeCount = {
  committee: string
  count: number
}

export type CongressFacets = {
  collections: Record<CongressCollection, CongressCollectionStat>
  /** Total hearing speaker turns in the attribution table (~7M). */
  turn_count: number
  /** Top committees by hearing count. */
  top_committees: CongressCommitteeCount[]
  /** Congress numbers present across collections. */
  congresses: number[]
  /** Congressional Record granule classes (HOUSE/SENATE/EXTENSIONS/DAILYDIGEST). */
  granule_classes: { value: string; count: number }[]
}

export async function fetchCongressFacets(): Promise<CongressFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/congress/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CongressFacets
}

export type CongressLawDisplayRow = {
  id: number
  law_key: string | null
  /** 'Public Law 95-511'. */
  pl_number: string | null
  congress: number | null
  law_number: number | null
  /** 'public' | 'private'. */
  law_kind: string | null
  title: string | null
  /** '92 Stat. 1783'. */
  statute_citation: string | null
  statute_volume: number | null
  approved_date: string | null
  /** 'statute' | 'plaw' — which GPO collection the text came from. */
  provenance: string | null
  citable_as: string[] | null
  text_length: number | null
}

export type CongressBillDisplayRow = {
  id: number
  /** '114hr2454'. */
  source_key: string | null
  congress: number | null
  /** 'hr' | 's' | 'hres' | 'sres' | 'hjres' | 'sjres' | 'hconres' | 'sconres'. */
  bill_type: string | null
  bill_number: string | null
  origin_chamber: string | null
  title: string | null
  introduced_date: string | null
  policy_area: string | null
  sponsor_names: string[] | null
  cosponsor_count: number | null
  committee_names: string[] | null
  latest_action_date: string | null
  latest_action_text: string | null
  became_law: boolean | null
  law_refs: string[] | null
  text_length: number | null
}

export type CongressHearingDisplayRow = {
  id: number
  /** 'CHRG-118shrg58969'. */
  source_key: string | null
  title: string | null
  congress: number | null
  chamber: string | null
  held_date: string | null
  committee_names: string[] | null
  witness_names: string[] | null
  year: number | null
  text_length: number | null
}

export type CongressRecordDisplayRow = {
  id: number
  /** 'CREC-2006-09-28-pt2-PgH7853'. */
  source_key: string | null
  title: string | null
  /** 'HOUSE' | 'SENATE' | 'EXTENSIONS' | 'DAILYDIGEST'. */
  granule_class: string | null
  member_names: string[] | null
  bill_refs: string[] | null
  record_date: string | null
  text_length: number | null
}

export type CongressTestimonyDisplayRow = {
  id: number
  /** 'HHRG-118-JU08-Wstate-GoiteinE-20230714'. */
  source_key: string | null
  congress: number | null
  committee_code: string | null
  doc_type: string | null
  witness: string | null
  statement_date: string | null
  text_length: number | null
  url: string | null
}

export type CongressDisplayRowMap = {
  laws: CongressLawDisplayRow
  bills: CongressBillDisplayRow
  hearings: CongressHearingDisplayRow
  record: CongressRecordDisplayRow
  testimony: CongressTestimonyDisplayRow
}

export type CongressAnyDisplayRow = CongressDisplayRowMap[CongressCollection]

export type CongressFilterFields = {
  collection: CongressCollection
  search?: string
  congress?: number
  /** 'House' | 'Senate' (bills origin chamber; hearings chamber). */
  chamber?: string
  /** Full committee name — 'Committee on the Judiciary'. */
  committee?: string
  /** Member bioguide id — 'R000584'. */
  bioguideId?: string
  /** Witness name fragment (testimony collection). */
  witness?: string
  /** Bills only: enacted bills. */
  becameLaw?: boolean
  /** Record only: granule class. */
  granuleClass?: string
  /** Laws only: 'public' | 'private'. */
  lawKind?: string
  /** Bills only: CRS policy area ('Law', 'Health', …). */
  policyArea?: string
  /** Collection-appropriate date range (approved/introduced/held/record/statement). */
  from?: string
  to?: string
}

export type CongressFilterResult = {
  collection: CongressCollection
  ids: number[]
  display_rows: CongressAnyDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runCongressFilter(
  fields: CongressFilterFields,
): Promise<CongressFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/congress/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CongressFilterResult
}

/** One entry in a bill's actions timeline (jsonb from congress.gov). */
export type CongressBillAction = {
  text?: string
  type?: string
  actionDate?: string
}

export type CongressHearingMember = {
  name?: string
  role?: string
  party?: string
  state?: string
  chamber?: string
  last_name?: string
  bioguideId?: string
}

export type CongressHearingWitness = {
  name?: string
  display?: string
  last_name?: string
  affiliation?: string
}

export type CongressHearingCommittee = {
  name?: string
  chamber?: string
  authorityId?: string
}

export type CongressLawDetail = CongressLawDisplayRow & {
  source_key: string | null
  source_key_plaw: string | null
  source_key_statute: string | null
  body_text: string | null
}

export type CongressBillDetail = CongressBillDisplayRow & {
  sponsor_bioguide_ids: string[] | null
  subjects: string[] | null
  /** CRS summary (may contain HTML entities). */
  summary: string | null
  bill_version: string | null
  actions: CongressBillAction[] | null
  body_text: string | null
}

export type CongressHearingDetail = CongressHearingDisplayRow & {
  jacket: string | null
  member_names: string[] | null
  member_bioguide_ids: string[] | null
  members: CongressHearingMember[] | null
  witnesses: CongressHearingWitness[] | null
  committees: CongressHearingCommittee[] | null
  body_text: string | null
}

export type CongressRecordDetail = CongressRecordDisplayRow & {
  member_bioguide_ids: string[] | null
  body_text: string | null
}

export type CongressTestimonyDetail = CongressTestimonyDisplayRow & {
  event_id: string | null
  body_text: string | null
}

export type CongressDetailMap = {
  laws: CongressLawDetail
  bills: CongressBillDetail
  hearings: CongressHearingDetail
  record: CongressRecordDetail
  testimony: CongressTestimonyDetail
}

export type CongressDocumentResponse<
  C extends CongressCollection = CongressCollection,
> = {
  collection: C
  document: CongressDetailMap[C]
  /** Hearings only: speaker-turn attribution stats. */
  turns_count?: number
  attributed_turns_count?: number
  has_turns?: boolean
}

export async function fetchCongressDocument<C extends CongressCollection>(
  collection: C,
  id: number,
): Promise<CongressDocumentResponse<C>> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/document`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection, id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/congress/document failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CongressDocumentResponse<C>
}

export type CongressTurnsFields = {
  /** FTS over the turn text. */
  search?: string
  /** Member bioguide id — exact ('R000584'). */
  bioguideId?: string
  /** Witness name fragment (matches witness-type speakers). */
  witnessName?: string
  /** 'member' | 'witness' | 'ambiguous' — attribution-quality browsing. */
  speakerType?: string
  /** Restrict to one hearing ('CHRG-118shrg58969'). */
  hearingSourceKey?: string
  /** Pair each turn with the question it answers (Q→A cards). */
  withQuestion?: boolean
}

export type CongressTurn = {
  id: number
  hearing_source_key: string
  turn_index: number
  speaker_raw: string | null
  /** 'member' | 'witness' | 'ambiguous' | … — ambiguous speakers are
   * flagged, never guessed (the corpus's attribution candor rule). */
  speaker_type: string | null
  resolved_name: string | null
  bioguide_id: string | null
  party: string | null
  affiliation: string | null
  excerpt: string | null
  text_length: number | null
  hearing_title: string | null
  held_date: string | null
  hearing_committees: string[] | null
  /** Present when withQuestion=true: the preceding question turn. */
  question_speaker_raw?: string | null
  question_speaker_type?: string | null
  question_speaker?: string | null
  question_bioguide_id?: string | null
  question_excerpt?: string | null
}

export type CongressTurnsResult = {
  turns: CongressTurn[]
  count: number
  capped: boolean
  with_question: boolean
  generated_sql: string
}

export async function runCongressTurns(
  fields: CongressTurnsFields,
): Promise<CongressTurnsResult> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/congress/turns failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as CongressTurnsResult
}

export type CongressAmaPlan = {
  token: string
  output_mode: AmaOutputMode
  approach_summary: string
  candor_notes: string[]
  queries: AmaPlanQuery[]
  estimated_cost_cents: number
  _cost_cents?: number
  _balance_cents?: number
}

export type CongressAmaSynthesis = {
  answer_markdown: string
  /** Cited ids. May be collection-qualified strings ('bills:75567') or bare
   * numbers, depending on what the planner touched — the UI parses both. */
  document_ids: Array<string | number> | null
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

export type CongressAmaScope = {
  /** Present when a filter narrows the AMA — the active collection's ids. */
  document_ids?: number[] | null
  /** Which collection the ids belong to. */
  collection?: CongressCollection
  is_full_db?: boolean
  count?: number
  description?: string
}

export async function runCongressPlan(
  question: string,
  scope: CongressAmaScope,
  auth: AuthArg,
): Promise<CongressAmaPlan> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/plan`, {
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
      body.error?.message ?? `Congress plan failed (${r.status})`,
      'plan',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CongressAmaPlan
}

export async function runCongressExecute(
  token: string,
  auth: AuthArg,
): Promise<CongressAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/execute`, {
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
      body.error?.message ?? `Congress execute failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CongressAmaSynthesis
}

export type CongressDocumentSummary = {
  summary_markdown: string
  candor_notes: string[]
  was_truncated: boolean
  _cost_cents?: number
  _balance_cents?: number
}

export async function runCongressSummarizeDocument(
  collection: CongressCollection,
  id: number,
  auth: AuthArg,
): Promise<CongressDocumentSummary> {
  const r = await fetch(`${WORKER_URL}/corpus/congress/summarize-document`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      collection,
      id,
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    throw new WorkerAmaError(
      body.error?.message ?? `Congress summarize failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as CongressDocumentSummary
}

/* ----------------------------------------------------------------------------
 * /corpus/clemency/* — clemency grants (the Presidential Documents corpus's
 * second table; brief #11 §7). Person-shaped pardon/commutation records,
 * sourced from Pardonpedia (CC BY 4.0). Surfaced inside the Presidential
 * Documents spoke via a Documents/Clemency toggle.
 * ------------------------------------------------------------------------- */

export type ClemencyFacetCount = { value: string; count: number }

export type ClemencyFacets = {
  grant_count: number
  with_warrant_text: number
  earliest: string
  latest: string
  clemency_types: ClemencyFacetCount[]
  presidents: ClemencyFacetCount[]
  topics: ClemencyFacetCount[]
}

export async function fetchClemencyFacets(): Promise<ClemencyFacets> {
  const r = await fetch(`${WORKER_URL}/corpus/clemency/facets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/clemency/facets failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as ClemencyFacets
}

export type ClemencyGrantDisplayRow = {
  pardon_id: number
  clemency_type: string | null
  person_name: string | null
  grant_date: string | null
  president_name: string | null
  district: string | null
  offense: string | null
  topic: string | null
  relationship: string | null
  /** doj | wikipedia_derived | whitehouse | other — the auditability axis. */
  provenance: string | null
  warrant_url: string | null
  has_reoffended: boolean
  forgiven_amount: number | null
  news_count: number
  has_warrant_text: boolean
}

export type ClemencyFilterFields = {
  search?: string
  person?: string
  /** 'Pardon' | 'Commutation'. */
  clemencyType?: string
  president?: string
  topic?: string
  district?: string
  provenance?: string
  relationship?: string
  reoffended?: boolean
  from?: string
  to?: string
}

export type ClemencyFilterResult = {
  ids: number[]
  display_rows: ClemencyGrantDisplayRow[]
  count: number
  generated_sql: string
  executed_sql: string
}

export async function runClemencyFilter(
  fields: ClemencyFilterFields,
): Promise<ClemencyFilterResult> {
  const r = await fetch(`${WORKER_URL}/corpus/clemency/filter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/clemency/filter failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as ClemencyFilterResult
}

export type ClemencyGrantDetail = ClemencyGrantDisplayRow & {
  president_term: string | null
  sentenced: string | null
  office_held: string | null
  source_url: string | null
  warrant_text: string | null
  warrant_text_length: number | null
  wikipedia_url: string | null
  wikipedia_name: string | null
  wikipedia_summary_title: string | null
  wikipedia_summary_extract: string | null
  wikipedia_article_url: string | null
  /** Folded aux records: money / givebacks / reoffenders / news / corpus_links. */
  extras: Record<string, unknown[]> | null
}

export async function fetchClemencyGrant(
  id: number,
): Promise<ClemencyGrantDetail> {
  const r = await fetch(`${WORKER_URL}/corpus/clemency/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/clemency/grant failed (${r.status}): ${msg}`)
  }
  const body = (await r.json()) as { grant: ClemencyGrantDetail }
  return body.grant
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
  /** Client-generated id so the Worker's server-side trace log joins the same
   *  usage_log row the inline annotation later upserts onto. */
  interactionId?: string,
): Promise<LawfareAmaSynthesis> {
  const r = await fetch(`${WORKER_URL}/corpus/lawfare/execute`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      token,
      ...(interactionId ? { interaction_id: interactionId } : {}),
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

export function fetchPresidentialItemsByIds(
  ids: readonly number[],
): Promise<PresidentialDocumentDisplayRow[]> {
  return fetchItemsByIds<PresidentialDocumentDisplayRow>(
    `${WORKER_URL}/corpus/presidential/items-by-ids`,
    ids,
  )
}

export function fetchFrItemsByIds(
  ids: readonly number[],
): Promise<FrDocumentDisplayRow[]> {
  return fetchItemsByIds<FrDocumentDisplayRow>(
    `${WORKER_URL}/corpus/fr/items-by-ids`,
    ids,
  )
}

/**
 * Congress variant — the endpoint additionally needs the `collection`
 * discriminator (five collections share one spoke), so it doesn't go
 * through the shared ids-only helper above.
 */
export async function fetchCongressItemsByIds<C extends CongressCollection>(
  collection: C,
  ids: readonly number[],
): Promise<CongressDisplayRowMap[C][]> {
  if (ids.length === 0) return []
  const r = await fetch(`${WORKER_URL}/corpus/congress/items-by-ids`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ collection, ids }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(
      `/corpus/congress/items-by-ids failed (${r.status}): ${msg}`,
    )
  }
  const body = (await r.json()) as { display_rows: CongressDisplayRowMap[C][] }
  return body.display_rows
}

/* ----------------------------------------------------------------------------
 * Semantic search (brief #9) — vector retrieval over the pgvector chunk
 * store, pilot corpora only. The spoke UI's segregated view calls this with
 * mode 'semantic' (vector-only) and pairs it with the spoke's own filter
 * path for the keyword pane; mode 'hybrid' (RRF-fused) is reserved for AI-
 * planner use.
 * ------------------------------------------------------------------------- */

export type SemanticCorpus =
  | 'olc'
  | 'frus'
  | 'lawfare'
  | 'presidential'
  | 'fr'
  | 'congress'

export type SemanticSearchRow = {
  id: string
  title: string
  /** Corpus-appropriate context line (OLC: source; FRUS: place/volume;
   *  Lawfare: content type). */
  context: string | null
  date: string | null
  matched: 'semantic' | 'keyword' | 'both'
  score: number
  /** Cosine similarity of the best-matching chunk (vector branch only). */
  similarity: number | null
  /** Best-matching chunk text, structural header stripped. */
  snippet: string | null
}

export type SemanticSearchResult = {
  corpus: SemanticCorpus
  query: string
  mode: 'semantic' | 'hybrid'
  results: SemanticSearchRow[]
  branches: {
    semantic: { count: number } | { error: string }
    keyword: { count: number } | { error: string } | { skipped: true }
  }
}

export async function runSemanticSearch(
  corpus: SemanticCorpus,
  query: string,
  opts?: { k?: number; mode?: 'semantic' | 'hybrid' },
): Promise<SemanticSearchResult> {
  const r = await fetch(`${WORKER_URL}/corpus/semantic-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      corpus,
      query,
      k: opts?.k ?? 12,
      mode: opts?.mode ?? 'semantic',
    }),
  })
  if (!r.ok) {
    const msg = await safeErrorMessage(r)
    throw new Error(`/corpus/semantic-search failed (${r.status}): ${msg}`)
  }
  return (await r.json()) as SemanticSearchResult
}

/* ----------------------------------------------------------------------------
 * /corpus/<slug>/more-like-this — "More like this" pivot (briefs §3, decision #1)
 *
 * The seed document supplies the semantic anchor; the user's "in what way?"
 * axis answer (`prompt`) routes the search. The Worker classifies internally:
 *   - meaning  — overall similarity, seed-centroid kNN (zero model cost). Sent
 *                explicitly via the "overall similarity" chip (route:"meaning")
 *                or implied by an empty prompt.
 *   - compound — a stated theory / holding / event / topic. One model call reads
 *                the seed through that lens, extrapolates a feature query, and
 *                runs semantic search. Chosen by the router, never by the client
 *                (the client only ever sends "auto" or "meaning").
 *
 * Gated behind AI access like AMA (resolveCorpusAuth runs even for the meaning
 * route — product-coherence per decision #1 — and applies the per-IP limit).
 * ------------------------------------------------------------------------- */

/** A spoke that participates in "more like this". Mirrors the Worker's
 *  MORE_LIKE_THIS_CORPORA map; litigation pivots on the per-case digest. */
export type MoreLikeThisCorpus =
  | 'litigation'
  | 'olc'
  | 'frus'
  | 'lawfare'
  | 'presidential'
  | 'fr'
  // Congress pivots are per-collection — the Worker's MORE_LIKE_THIS_CORPORA
  // map keys the five collections as compound slugs (verified live: the
  // error envelope lists them; /corpus/congress:laws/more-like-this routes).
  | 'congress:laws'
  | 'congress:bills'
  | 'congress:hearings'
  | 'congress:record'
  | 'congress:testimony'

export type MoreLikeThisRoute = 'meaning' | 'compound'

export type MoreLikeThisResultItem = {
  id: string
  title: string
  /** Corpus-appropriate context line (OLC: source; FRUS: place/volume; etc.). */
  context: string | null
  date: string | null
  /** Cosine similarity of the best-matching chunk. */
  similarity: number | null
  /** Best-matching chunk text, structural header stripped. */
  snippet: string | null
}

export type MoreLikeThisResult = {
  slug: string
  corpus: string
  /** What the Worker actually did — a compound prompt can resolve to meaning. */
  route: MoreLikeThisRoute
  seed: { id: string; title: string | null }
  /** One sentence naming what the results are matched on — shown to the user. */
  lens: string
  prompt: string | null
  results: MoreLikeThisResultItem[]
  /** True when the result set is full at the current k and k < the 50 max. */
  widen_available: boolean
  /** Honesty caveat — set when the axis implies a relation (cites/agrees/
   *  responds-to) or style that similarity genuinely can't see (brief §5). */
  note?: string
  /** Compound route only: the extrapolated feature query the Worker searched. */
  query?: string
  /** Compound route only: exact literal terms worth matching verbatim. */
  keywords?: string
  _cost_cents?: number
  _balance_cents?: number
}

export type MoreLikeThisRequest = {
  slug: MoreLikeThisCorpus
  /** The seed document id (OLC opinion id, FRUS doc id, litigation cl_id, …). */
  seedId: number
  /** The user's "more like this in what way?" answer. Empty → overall similarity. */
  prompt?: string
  /** "auto" lets the router classify; "meaning" forces zero-model overall
   *  similarity. "compound" is chosen internally by the router, never sent. */
  route?: 'auto' | 'meaning'
  /** Result count (Worker default 25, max 50). "Widen" re-runs at the max. */
  k?: number
}

export async function runMoreLikeThis(
  req: MoreLikeThisRequest,
  auth: AuthArg,
): Promise<MoreLikeThisResult> {
  const r = await fetch(`${WORKER_URL}/corpus/${req.slug}/more-like-this`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify({
      ...authBody(auth),
      seed_id: req.seedId,
      prompt: req.prompt ?? '',
      route: req.route ?? 'auto',
      ...(req.k != null ? { k: req.k } : {}),
    }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string }
    }
    // Reuse WorkerAmaError so spoke UIs surface error.message/code uniformly
    // (MLT bills like AMA and shares the same auth/error envelope).
    throw new WorkerAmaError(
      body.error?.message ?? `More like this failed (${r.status})`,
      'execute',
      r.status,
      body.error?.code,
    )
  }
  return (await r.json()) as MoreLikeThisResult
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
