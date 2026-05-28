import { useContext } from 'react'
import { PaidContext, type PaidContextValue } from './paid-context'

/**
 * Access the paid-tier auth state from anywhere in the tree.
 *
 * Throws if used outside `<PaidProvider>` — the provider is mounted at the
 * app root so this should never fire in practice; the throw is a
 * defensive check for refactors.
 */
export function usePaid(): PaidContextValue {
  const v = useContext(PaidContext)
  if (!v) throw new Error('usePaid must be used inside <PaidProvider>')
  return v
}
