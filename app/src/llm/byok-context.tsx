import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Bring-Your-Own-Key configuration context.
 *
 * The React rebuild's first cut of AI-mode access is BYOK only — the user
 * pastes their own provider API key, which is persisted to localStorage and
 * sent (in the request body, per the Worker's resolveCorpusAuth) on each
 * /corpus/{sql,read,analyze,plan,execute} call. Paid-tier (Lawfare-billed
 * Anthropic with Stripe-prepaid balance) lands in a separate auth-bringup PR.
 *
 * Only Anthropic is supported in v1 of the React rebuild. OpenAI and Google
 * are accepted by the Worker on the BYOK path, but the React app doesn't
 * surface them yet — adding them is a config-only follow-up.
 *
 * Storage key: `ragtime_byok` (single JSON blob). API keys live in
 * localStorage in plaintext; this matches the legacy app's posture for BYOK.
 *
 * NOTE: The `useByok` hook lives in a sibling `use-byok.ts` file so this
 * file only exports the component (keeping the react-refresh
 * fast-refresh contract intact).
 */

export type Provider = 'anthropic' | 'openai' | 'google'

export type ByokConfig = {
  provider: Provider
  model: string
  apiKey: string
}

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  // Reserved — not user-selectable in the v1 UI:
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
}

const STORAGE_KEY = 'ragtime_byok'

export type ByokContextValue = {
  /** Current configured BYOK. `null` until the user saves one. */
  config: ByokConfig | null
  /** Convenience: whether any usable BYOK is configured. */
  isConfigured: boolean
  /** Save a new config. Provider+model+key all required. */
  save: (config: ByokConfig) => void
  /** Wipe the config (logs out of BYOK). */
  clear: () => void
  /** Default model for a given provider — useful for form initialization. */
  defaultModelFor: (provider: Provider) => string
}

// Exported for use by the sibling `useByok` hook in ./use-byok.ts.
// eslint-disable-next-line react-refresh/only-export-components
export const ByokContext = createContext<ByokContextValue | undefined>(
  undefined,
)

export function ByokProvider({ children }: { children: ReactNode }) {
  // Initialize lazily from localStorage so the initial render reflects any
  // saved key without a flash of "not configured" state.
  const [config, setConfig] = useState<ByokConfig | null>(() =>
    loadFromStorage(),
  )

  // Cross-tab sync: if the user updates BYOK in another tab, mirror here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setConfig(loadFromStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const save = useCallback((next: ByokConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // localStorage can throw in private-browsing modes; the state still
      // updates so the current session works.
    }
    setConfig(next)
  }, [])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore — private browsing, etc.
    }
    setConfig(null)
  }, [])

  const defaultModelFor = useCallback(
    (provider: Provider) => DEFAULT_MODEL[provider],
    [],
  )

  const value = useMemo<ByokContextValue>(
    () => ({
      config,
      isConfigured: config != null && config.apiKey.trim().length > 0,
      save,
      clear,
      defaultModelFor,
    }),
    [config, save, clear, defaultModelFor],
  )

  return <ByokContext.Provider value={value}>{children}</ByokContext.Provider>
}

function loadFromStorage(): ByokConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ByokConfig>
    if (
      parsed &&
      typeof parsed.provider === 'string' &&
      (parsed.provider === 'anthropic' ||
        parsed.provider === 'openai' ||
        parsed.provider === 'google') &&
      typeof parsed.model === 'string' &&
      typeof parsed.apiKey === 'string'
    ) {
      return {
        provider: parsed.provider,
        model: parsed.model,
        apiKey: parsed.apiKey,
      }
    }
    return null
  } catch {
    return null
  }
}
