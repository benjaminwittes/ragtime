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
 */

const WORKER_URL =
  (import.meta.env.VITE_WORKER_URL as string | undefined) ||
  'https://ragtimeproxy.benjamin-wittes.workers.dev'

const KEY = 'ragtime_usage_log_v1'
const EVENT = 'ragtime:usage-log-toggle-changed'

export function isUsageLogEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setUsageLogEnabled(on: boolean): void {
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
  mode: 'ama' | 'keyword' | 'manual_filter' | 'summarize'
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
 * Upsert an interaction record. No-op (returns false) when the toggle is off
 * or auth is absent. Never throws — logging must not break the UI.
 */
export async function postUsageLog(
  record: UsageLogRecord,
  auth: AuthArg | null | undefined,
): Promise<boolean> {
  if (!isUsageLogEnabled() || !auth) return false
  try {
    const r = await fetch(`${WORKER_URL}/corpus/feedback/log`, {
      method: 'POST',
      headers: authHeaders(auth),
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
