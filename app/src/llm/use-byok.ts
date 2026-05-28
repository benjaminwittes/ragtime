import { useContext } from 'react'
import { ByokContext, type ByokContextValue } from './byok-context'

/**
 * Read-side hook for the BYOK context. Lives in its own file so
 * byok-context.tsx can keep the react-refresh "only-export-components"
 * contract (which doesn't accept hook exports alongside component exports).
 */
export function useByok(): ByokContextValue {
  const ctx = useContext(ByokContext)
  if (!ctx) {
    throw new Error('useByok must be used within a ByokProvider')
  }
  return ctx
}
