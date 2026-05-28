/**
 * Worker client — typed wrappers for the Cloudflare Worker's /corpus/* endpoints.
 *
 * The Worker (ragtimeproxy) is the corpus query path's server-side surface;
 * /corpus/* endpoints query the corpus Supabase project. They're public + IP
 * rate-limited (no auth required for the free-tier reads used here). Auth-
 * gated AI endpoints (/corpus/sql, /corpus/analyze, /corpus/plan,
 * /corpus/execute) land in later PRs.
 *
 * v1 wired endpoints:
 *  - POST /corpus/facets — corpus counts + court / judge / collection lists
 *  - POST /corpus/filter — manual filter execution against the cases table
 *
 * WORKER URL: VITE_WORKER_URL env var, with the production URL as the
 * fallback. Override in `app/.env.local` for dev work against a local
 * `wrangler dev` instance.
 */

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
