import { useMemo } from 'react'
import { usePaid } from '@/auth/use-paid'
import { useByok } from '@/llm/use-byok'
import { useDemoPassword } from '@/lib/demo-access'
import type { AuthArg } from '@/lib/auth-arg'

/**
 * Resolve the single active auth mode the spoke should use for billed
 * calls. Precedence: paid (when signed in) > BYOK (when configured) >
 * demo (when a demo password is set) > nothing.
 *
 * Demo is the TEMPORARY pre-launch demo path (see src/lib/demo-access.ts);
 * it sits below paid + BYOK so a real user's own credentials always win.
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
  /** True when the demo password is the active credential. */
  isDemo: boolean
  /** True when at least one auth path is usable. */
  hasAuth: boolean
  /** Active model name (so UI can display it). */
  activeModel: string | null
}

const PAID_DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEMO_DEFAULT_MODEL = 'claude-sonnet-4-6'

export function useAuth(): ResolvedAuth {
  const paid = usePaid()
  const byok = useByok()
  const demoPassword = useDemoPassword()

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
        isDemo: false,
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
        isDemo: false,
        hasAuth: true,
        activeModel: byok.config.model,
      }
    }
    if (demoPassword) {
      const model = byok.config?.model ?? DEMO_DEFAULT_MODEL
      return {
        auth: {
          mode: 'demo',
          model,
          password: demoPassword,
        },
        isPaid: false,
        hasByok: false,
        isDemo: true,
        hasAuth: true,
        activeModel: model,
      }
    }
    return {
      auth: null,
      isPaid: false,
      hasByok: false,
      isDemo: false,
      hasAuth: false,
      activeModel: null,
    }
  }, [paid.signedIn, paid.session, byok.isConfigured, byok.config, demoPassword])
}
