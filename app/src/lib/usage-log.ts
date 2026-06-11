import { useSyncExternalStore } from 'react'
import { type AuthArg, authCredentialBody, authHeaders } from '@/lib/auth-arg'

/**
 * Usage + annotation log (feature: ragtime-usage-log-feedback).
 *
 * Client-side capture: the app already holds the full plan→execute→synthesize
 * trace, so it assembles the interaction record + the logger's inline
 * rating/note and upserts it to the Worker's /corpus/feedback/log endpoint
 * (keyed by a client-generated interaction_id; the endpoint merge-upserts so
 * the initial auto-log and the later annotation land on one row).
 *
 * Gate (Ben, 2026-05-30): "any mode, private toggle." A not-advertised
 * localStorage toggle controls whether the app sends logs — works in demo /
 * BYOK / paid so it captures real testing. The Worker endpoint additionally
 * requires valid corpus credentials, so it can't be spammed anonymously and
 * records whatever identity exists. v1 = the toggle-holder only; expand to
 * trusted users by giving them the toggle.
 *
 * Logging is strictly fire-and-forget: a failure here must NEVER degrade the
 * research flow, so postUsageLog swallows all errors.
 *
 * Storage: localStorage `ragtime_usage_log_v1` ('on' | absent).
 *
 * ⚠️ INTERNAL TOOL, NOT PRODUCT. This is part of the internal refinement
 * process and is meant to be STRIPPED OUT or disabled before public release.
 * It's off by default (the private toggle), so it's inert for release even if
 * left in. To remove entirely: delete this file + UsageLogAnnotation.tsx,
 * remove the "Log my sessions for tuning" toggle from AccessSettings
 * (PreferencesPanel), and grep `usage-log` / `UsageLogAnnotation` to delete
 * the one-line call sites in the spoke shells (plus the Worker's
 * /corpus/feedback/log handler + the usage_log table). Same disposable
 * posture as demo-access.ts.
 */

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ||
  'https://ragtimeproxy.benjamin-wittes.workers.dev'

const KEY = 'ragtime_usage_log_v1'
const EVENT = 'ragtime:usage-log-toggle-changed'

/**
 * Build-time gate. The PUBLIC production build ships with logging fully OFF and
 * the logging UI absent: VITE_ENABLE_USAGE_LOG is unset, so every function here
 * is inert and the "Log my sessions" toggle is not rendered. Ben's INTERNAL
 * build sets VITE_ENABLE_USAGE_LOG=1 plus VITE_USAGE_LOG_TOKEN=<shared secret>;
 * the token rides each log request as X-Usage-Log-Token and the Worker only
 * writes when it matches its USAGE_LOG_TOKEN. So the public service has no
 * logging function at all, in the bundle or over the wire.
 */
export const usageLoggingBuildEnabled =
  import.meta.env.VITE_ENABLE_USAGE_LOG === '1'
const LOG_TOKEN = (import.meta.env.VITE_USAGE_LOG_TOKEN as string | undefined) || ''

export function isUsageLogEnabled(): boolean {
  if (!usageLoggingBuildEnabled) return false
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setUsageLogEnabled(on: boolean): void {
  if (!usageLoggingBuildEnabled) return
  if (typeof window === 'undefined') return
  try {
    if (on) window.localStorage.setItem(KEY, 'on')
    else window.localStorage.removeItem(KEY)
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    // No-op in restricted environments (private mode / sandboxed iframe).
  }
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb()
  }
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', storageHandler)
  }
}

/** Reactive read of the private logging toggle. */
export function useUsageLogEnabled(): boolean {
  return useSyncExternalStore(subscribe, isUsageLogEnabled, () => false)
}

/** Fresh per-interaction id (client-generated; the upsert key). */
export function newInteractionId(): string {
  return crypto.randomUUID()
}

/**
 * One interaction record. The trace fields mirror parseUsageLogRequest in
 * worker/index.js; everything is optional except interaction_id / surface /
 * mode because annotation re-sends the full record + rating/note.
 */
export type UsageLogRecord = {
  interaction_id: string
  surface: string
  mode:
    | 'ama'
    | 'keyword'
    | 'manual_filter'
    | 'summarize'
    | 'sql'
    | 'read'
    | 'analyze'
    | 'semantic_search'
  question?: string | null
  output_mode?: string | null
  plan?: unknown
  query_summary?: unknown
  answer_markdown?: string | null
  cited_ids?: unknown
  candor_notes?: unknown
  cost_cents?: number | null
  provider?: string | null
  model?: string | null
  rating?: number | null
  note?: string | null
}

/**
 * Logging is active for a given session when it's in DEMO mode (the Lawfare
 * internal shared-password mode — the public beta never uses demo) or when the
 * internal dev build's toggle is on. Public paid/BYOK sessions never log, so the
 * privacy policy's "our code does not log them" holds for the public; the Worker
 * enforces the same gate server-side (usageLoggingAllowed).
 */
export function usageLogActiveFor(auth: AuthArg | null | undefined): boolean {
  return !!auth && (auth.mode === 'demo' || isUsageLogEnabled())
}

/**
 * Upsert an interaction record. No-op (returns false) when logging isn't active
 * for this session or auth is absent. Never throws — logging must not break UI.
 */
export async function postUsageLog(
  record: UsageLogRecord,
  auth: AuthArg | null | undefined,
): Promise<boolean> {
  if (!auth || !usageLogActiveFor(auth)) return false
  try {
    const r = await fetch(`${WORKER_URL}/corpus/feedback/log`, {
      method: 'POST',
      headers: { ...authHeaders(auth), 'X-Usage-Log-Token': LOG_TOKEN },
      body: JSON.stringify({
        ...authCredentialBody(auth),
        client_ts: new Date().toISOString(),
        ...record,
      }),
    })
    return r.ok
  } catch {
    return false
  }
}
