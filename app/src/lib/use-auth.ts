import { useMemo } from 'react'
import { usePaid } from '@/auth/use-paid'
import { useByok } from '@/llm/use-byok'
import type { AuthArg } from '@/lib/auth-arg'

/**
 * Resolve the single active auth mode the spoke should use for billed
 * calls. Precedence: paid (when signed in) > BYOK (when configured) >
 * nothing.
 *
 * The model used in paid mode follows the BYOK config when one is present,
 * so a user who has both set up keeps using whichever Claude they chose;
 * otherwise we fall back to the paid-tier default. This matches the legacy
 * app's `llmAccess.model` handling.
 *
 * Returns `null` when no auth is available — caller (SpokeShell) gates
 * AI-mode enablement on this. Also exposes flags for the headers/banners
 * that care about which mode is active (e.g., the AccessSettings status
 * pip + the AmaPreflight balance disclosure).
 */

export type ResolvedAuth = {
  /** Auth payload ready to pass to runClaudeSql / runClaudePlan / etc.
   *  null when neither paid nor BYOK is configured. */
  auth: AuthArg | null
  /** True when paid-tier session is active. */
  isPaid: boolean
  /** True when BYOK is configured (independent of paid). */
  hasByok: boolean
  /** True when at least one auth path is usable. */
  hasAuth: boolean
  /** Active model name (so UI can display it). */
  activeModel: string | null
}

const PAID_DEFAULT_MODEL = 'claude-sonnet-4-6'

export function useAuth(): ResolvedAuth {
  const paid = usePaid()
  const byok = useByok()

  return useMemo<ResolvedAuth>(() => {
    if (paid.signedIn && paid.session?.access_token) {
      const model = byok.config?.model ?? PAID_DEFAULT_MODEL
      return {
        auth: {
          mode: 'paid',
          model,
          sessionToken: paid.session.access_token,
        },
        isPaid: true,
        hasByok: byok.isConfigured,
        hasAuth: true,
        activeModel: model,
      }
    }
    if (byok.isConfigured && byok.config) {
      return {
        auth: {
          mode: 'byok',
          provider: byok.config.provider,
          model: byok.config.model,
          apiKey: byok.config.apiKey,
        },
        isPaid: false,
        hasByok: true,
        hasAuth: true,
        activeModel: byok.config.model,
      }
    }
    return {
      auth: null,
      isPaid: false,
      hasByok: false,
      hasAuth: false,
      activeModel: null,
    }
  }, [paid.signedIn, paid.session, byok.isConfigured, byok.config])
}
